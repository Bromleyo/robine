import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyCronRequest } from '@/lib/cron-auth'
import { encryptToken, decryptToken } from '@/lib/crypto/token-cipher'
import { refreshGoogleToken } from '@/lib/google/auth'
import { listGmailMessageIds, fetchGmailMessage } from '@/lib/google/gmail'
import { processIncomingEmail } from '@/lib/email/process-incoming'
import { htmlToText, stripQuotedReply } from '@/lib/email/html-to-text'
import { logger } from '@/lib/logger'

async function refreshMicrosoftDelegatedToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      scope: 'Mail.Read Mail.Send offline_access',
    }),
  })
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

interface MicrosoftMailMessage {
  id: string
  internetMessageId: string
  conversationId: string
  subject: string | null
  from: { emailAddress: { address: string; name: string } }
  toRecipients: { emailAddress: { address: string } }[]
  ccRecipients: { emailAddress: { address: string } }[]
  body: { contentType: string; content: string }
  receivedDateTime: string
  internetMessageHeaders?: { name: string; value: string }[]
}

interface MicrosoftListResponse {
  value: MicrosoftMailMessage[]
}

async function listMicrosoftDelegatedMessages(
  accessToken: string,
  sinceIso: string,
  targetEmail?: string,
): Promise<MicrosoftMailMessage[]> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`)
  const select = 'id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,internetMessageHeaders'
  const base = targetEmail ? `users/${targetEmail}` : 'me'
  const url = `https://graph.microsoft.com/v1.0/${base}/mailFolders/Inbox/messages?$filter=${filter}&$select=${select}&$top=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Microsoft list failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as MicrosoftListResponse
  return data.value ?? []
}

function msMessageToNormalized(msg: MicrosoftMailMessage) {
  const headers: Record<string, string> = {}
  for (const h of msg.internetMessageHeaders ?? []) {
    headers[h.name.toLowerCase()] = h.value
  }

  const isHtml = msg.body.contentType.toLowerCase() === 'html'
  const bodyHtml = isHtml ? msg.body.content : null
  const bodyText = stripQuotedReply(isHtml ? htmlToText(msg.body.content) : msg.body.content)

  return {
    providerMessageId: msg.id,
    internetMessageId: msg.internetMessageId ?? msg.id,
    conversationId: msg.conversationId ?? null,
    subject: msg.subject ?? null,
    from: {
      address: msg.from.emailAddress.address.toLowerCase(),
      name: msg.from.emailAddress.name || null,
    },
    toRecipients: msg.toRecipients.map(r => r.emailAddress.address.toLowerCase()),
    ccRecipients: msg.ccRecipients.map(r => r.emailAddress.address.toLowerCase()),
    bodyHtml,
    bodyText,
    receivedAt: new Date(msg.receivedDateTime),
    headers,
    inReplyTo: headers['in-reply-to'] ?? null,
    references: headers['references']?.split(/\s+/).filter(Boolean) ?? [],
  }
}

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  // Volontairement, on poll AUSSI les mailboxes avec subscriptionId : ça fait
  // filet de sécurité si le webhook Graph rate une notification. Le check
  // d'idempotence dans process-incoming.ts (microsoftGraphId déjà en DB)
  // garantit qu'aucun doublon n'est créé.
  const mailboxes = await prisma.outlookMailbox.findMany({
    where: { actif: true, msRefreshToken: { not: null } },
    select: {
      id: true,
      email: true,
      sharedMailboxEmail: true,
      restaurantId: true,
      provider: true,
      msAccessToken: true,
      msRefreshToken: true,
      msTokenExpiry: true,
      lastPollAt: true,
    },
  })

  let processed = 0
  let errors = 0

  for (const mailbox of mailboxes) {
    try {
      const needsRefresh = !mailbox.msTokenExpiry || mailbox.msTokenExpiry.getTime() - Date.now() < 5 * 60_000

      let accessToken = decryptToken(mailbox.msAccessToken!)
      if (needsRefresh) {
        if (mailbox.provider === 'GMAIL') {
          const refreshed = await refreshGoogleToken(decryptToken(mailbox.msRefreshToken!))
          accessToken = refreshed.access_token
          await prisma.outlookMailbox.update({
            where: { id: mailbox.id },
            data: {
              msAccessToken: encryptToken(refreshed.access_token),
              msTokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
            },
          })
        } else {
          const refreshed = await refreshMicrosoftDelegatedToken(decryptToken(mailbox.msRefreshToken!))
          accessToken = refreshed.access_token
          await prisma.outlookMailbox.update({
            where: { id: mailbox.id },
            data: {
              msAccessToken: encryptToken(refreshed.access_token),
              msTokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
            },
          })
        }
      }

      const sinceDate = mailbox.lastPollAt ?? new Date(Date.now() - 24 * 60 * 60_000)
      const mailboxRef = { id: mailbox.id, email: mailbox.email, restaurantId: mailbox.restaurantId }

      if (mailbox.provider === 'GMAIL') {
        const sinceUnix = Math.floor(sinceDate.getTime() / 1000)
        const messageIds = await listGmailMessageIds(accessToken, sinceUnix)
        for (const messageId of messageIds) {
          const email = await fetchGmailMessage(accessToken, messageId)
          await processIncomingEmail(email, mailboxRef)
          processed++
        }
      } else {
        const sinceIso = sinceDate.toISOString().replace(/\.\d+Z$/, 'Z')
        const messages = await listMicrosoftDelegatedMessages(accessToken, sinceIso, mailbox.sharedMailboxEmail ?? undefined)
        for (const msg of messages) {
          const email = msMessageToNormalized(msg)
          await processIncomingEmail(email, mailboxRef)
          processed++
        }
      }

      await prisma.outlookMailbox.update({
        where: { id: mailbox.id },
        data: { lastPollAt: new Date() },
      })
    } catch (err) {
      errors++
      logger.error({ err, mailboxId: mailbox.id, email: mailbox.email }, 'email-poll: mailbox failed')
    }
  }

  return NextResponse.json({ ok: true, polled: mailboxes.length, processed, errors })
}
