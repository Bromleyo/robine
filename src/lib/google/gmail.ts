import type { NormalizedEmail } from '@/lib/email/types'
import { htmlToText } from '@/lib/email/html-to-text'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

interface GmailPayload {
  headers: { name: string; value: string }[]
  mimeType: string
  body: { data?: string; size: number }
  parts?: GmailPayload[]
}

interface GmailMessage {
  id: string
  threadId: string
  payload: GmailPayload
  internalDate: string
}

interface GmailListResponse {
  messages?: { id: string }[]
}

function decodeBase64url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf-8')
}

function extractBody(payload: GmailPayload): { html: string | null; text: string } {
  if (payload.mimeType === 'text/html') {
    return { html: payload.body.data ? decodeBase64url(payload.body.data) : '', text: '' }
  }
  if (payload.mimeType === 'text/plain') {
    return { html: null, text: payload.body.data ? decodeBase64url(payload.body.data) : '' }
  }
  if (payload.mimeType?.startsWith('multipart/')) {
    let html: string | null = null
    let text = ''
    for (const part of payload.parts ?? []) {
      if (part.mimeType === 'text/html' && part.body.data) html = decodeBase64url(part.body.data)
      else if (part.mimeType === 'text/plain' && part.body.data) text = decodeBase64url(part.body.data)
      else if (part.mimeType?.startsWith('multipart/')) {
        const nested = extractBody(part)
        if (nested.html) html = nested.html
        if (nested.text) text = nested.text
      }
    }
    return { html, text }
  }
  return { html: null, text: '' }
}

function parseEmailAddress(raw: string): { address: string; name: string | null } {
  const angleMatch = raw.match(/^([^<]*)<([^>]+)>/)
  if (angleMatch) {
    const name = angleMatch[1]!.trim().replace(/^"|"$/g, '') || null
    return { name, address: angleMatch[2]!.trim() }
  }
  return { name: null, address: raw.trim() }
}

function parseEmailAddresses(raw: string): string[] {
  const withAngles = [...raw.matchAll(/<([^>]+)>/g)].map(m => m[1])
  if (withAngles.length > 0) return withAngles.filter((a): a is string => !!a)
  return raw.split(',').map(s => s.trim()).filter(s => s.includes('@'))
}

export function gmailMessageToNormalized(msg: GmailMessage): NormalizedEmail {
  const headers: Record<string, string> = {}
  for (const h of msg.payload.headers) {
    headers[h.name.toLowerCase()] = h.value
  }

  const from = parseEmailAddress(headers['from'] ?? '')
  const toRecipients = parseEmailAddresses(headers['to'] ?? '')
  const ccRecipients = parseEmailAddresses(headers['cc'] ?? '')
  const internetMessageId = headers['message-id'] ?? msg.id
  const inReplyTo = headers['in-reply-to'] ?? null
  const references = headers['references']?.split(/\s+/).filter(Boolean) ?? []

  const { html, text } = extractBody(msg.payload)
  const bodyHtml = html
  const bodyText = html ? htmlToText(html) : text

  return {
    providerMessageId: msg.id,
    internetMessageId,
    conversationId: msg.threadId,
    subject: headers['subject'] ?? null,
    from,
    toRecipients,
    ccRecipients,
    bodyHtml,
    bodyText,
    receivedAt: new Date(parseInt(msg.internalDate)),
    headers,
    inReplyTo,
    references,
  }
}

export async function listGmailMessageIds(accessToken: string, sinceUnix: number): Promise<string[]> {
  const q = encodeURIComponent(`in:inbox after:${sinceUnix}`)
  const url = `${GMAIL_BASE}/messages?q=${q}&maxResults=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Gmail list failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as GmailListResponse
  return (data.messages ?? []).map(m => m.id)
}

export async function fetchGmailMessage(accessToken: string, messageId: string): Promise<NormalizedEmail> {
  const url = `${GMAIL_BASE}/messages/${messageId}?format=full`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Gmail fetch failed (${res.status}): ${await res.text()}`)
  const msg = await res.json() as GmailMessage
  return gmailMessageToNormalized(msg)
}

export async function sendGmailReply(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  inReplyTo: string,
  references: string,
  threadId: string,
): Promise<string> {
  const boundary = `boundary_${Date.now()}`
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${references}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
    `--${boundary}--`,
  ].join('\r\n')

  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded, threadId }),
  })
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { id: string }
  return data.id
}
