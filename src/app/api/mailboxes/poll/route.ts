import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { encryptToken, decryptToken } from '@/lib/crypto/token-cipher'
import { processIncomingEmail } from '@/lib/email/process-incoming'
import { htmlToText, stripQuotedReply } from '@/lib/email/html-to-text'
import { logger } from '@/lib/logger'

async function refreshMicrosoftToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
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
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

interface MsMessage {
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

async function listMessages(accessToken: string, sinceIso: string): Promise<MsMessage[]> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`)
  const select = 'id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,internetMessageHeaders'
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=${filter}&$select=${select}&$top=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`List messages failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { value: MsMessage[] }
  return data.value ?? []
}

function normalize(msg: MsMessage) {
  const headers: Record<string, string> = {}
  for (const h of msg.internetMessageHeaders ?? []) headers[h.name.toLowerCase()] = h.value
  const isHtml = msg.body.contentType.toLowerCase() === 'html'
  return {
    providerMessageId: msg.id,
    internetMessageId: msg.internetMessageId ?? msg.id,
    conversationId: msg.conversationId ?? null,
    subject: msg.subject ?? null,
    from: { address: msg.from.emailAddress.address.toLowerCase(), name: msg.from.emailAddress.name || null },
    toRecipients: msg.toRecipients.map(r => r.emailAddress.address.toLowerCase()),
    ccRecipients: msg.ccRecipients.map(r => r.emailAddress.address.toLowerCase()),
    bodyHtml: isHtml ? msg.body.content : null,
    bodyText: stripQuotedReply(isHtml ? htmlToText(msg.body.content) : msg.body.content),
    receivedAt: new Date(msg.receivedDateTime),
    headers,
    inReplyTo: headers['in-reply-to'] ?? null,
    references: headers['references']?.split(/\s+/).filter(Boolean) ?? [],
  }
}

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const mailboxes = await prisma.outlookMailbox.findMany({
    where: { restaurantId, actif: true, provider: 'MICROSOFT', msRefreshToken: { not: null }, subscriptionId: null },
    select: { id: true, email: true, restaurantId: true, msAccessToken: true, msRefreshToken: true, msTokenExpiry: true, lastPollAt: true },
  })

  let processed = 0
  for (const mailbox of mailboxes) {
    try {
      const needsRefresh = !mailbox.msTokenExpiry || mailbox.msTokenExpiry.getTime() - Date.now() < 5 * 60_000
      let accessToken = decryptToken(mailbox.msAccessToken!)
      if (needsRefresh) {
        const refreshed = await refreshMicrosoftToken(decryptToken(mailbox.msRefreshToken!))
        accessToken = refreshed.access_token
        await prisma.outlookMailbox.update({
          where: { id: mailbox.id },
          data: { msAccessToken: encryptToken(refreshed.access_token), msTokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000) },
        })
      }

      const sinceDate = mailbox.lastPollAt ?? new Date(Date.now() - 24 * 60 * 60_000)
      const sinceIso = sinceDate.toISOString().replace(/\.\d+Z$/, 'Z')
      const messages = await listMessages(accessToken, sinceIso)

      for (const msg of messages) {
        await processIncomingEmail(normalize(msg), { id: mailbox.id, email: mailbox.email, restaurantId: mailbox.restaurantId })
        processed++
      }

      await prisma.outlookMailbox.update({ where: { id: mailbox.id }, data: { lastPollAt: new Date() } })
    } catch (err) {
      logger.error({ err, mailboxId: mailbox.id }, 'manual poll: mailbox failed')
    }
  }

  return NextResponse.json({ ok: true, processed })
}
