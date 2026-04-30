import { getAppGraphToken } from './auth'
import { GraphRequestError, parseGraphErrorBody } from './errors'
import { logger } from '../logger'
import type { NormalizedEmail } from '@/lib/email/types'
import { htmlToText, stripQuotedReply } from '@/lib/email/html-to-text'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export function graphMessageToNormalized(msg: GraphMessage): NormalizedEmail {
  const headers: Record<string, string> = {}
  for (const h of msg.internetMessageHeaders ?? []) {
    headers[h.name.toLowerCase()] = h.value
  }
  const bodyHtml = msg.body.contentType === 'html' ? msg.body.content : null
  const bodyText = stripQuotedReply(bodyHtml ? htmlToText(bodyHtml) : msg.body.content)
  return {
    providerMessageId: msg.id,
    internetMessageId: msg.internetMessageId,
    conversationId: msg.conversationId ?? null,
    subject: msg.subject ?? null,
    from: { address: msg.from.emailAddress.address, name: msg.from.emailAddress.name ?? null },
    toRecipients: msg.toRecipients.map(r => r.emailAddress.address),
    ccRecipients: msg.ccRecipients.map(r => r.emailAddress.address),
    bodyHtml,
    bodyText,
    receivedAt: new Date(msg.receivedDateTime),
    headers,
    inReplyTo: headers['in-reply-to'] ?? null,
    references: headers['references']?.split(/\s+/).filter(Boolean) ?? [],
  }
}

export interface GraphMessage {
  id: string
  internetMessageId: string
  conversationId: string
  subject: string
  from: { emailAddress: { name: string; address: string } }
  toRecipients: { emailAddress: { address: string } }[]
  ccRecipients: { emailAddress: { address: string } }[]
  body: { contentType: 'html' | 'text'; content: string }
  receivedDateTime: string
  internetMessageHeaders?: { name: string; value: string }[]
}

const SELECT_FIELDS = [
  'id', 'internetMessageId', 'conversationId', 'subject',
  'from', 'toRecipients', 'ccRecipients', 'body',
  'receivedDateTime', 'internetMessageHeaders',
].join(',')

const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024

async function throwStructuredGraphError(
  res: Response,
  operation: 'createReply' | 'patchDraft' | 'sendDraft',
  ctx: { mailboxEmail: string; graphMessageId: string | null },
): Promise<never> {
  const rawBody = await res.text()
  const { code, message } = parseGraphErrorBody(rawBody)
  logger.error({
    operation,
    status: res.status,
    graphCode: code,
    graphMessage: message,
    mailboxEmail: ctx.mailboxEmail,
    graphMessageId: ctx.graphMessageId,
    rawBody: rawBody.slice(0, 500),
  }, '[graph] request failed')
  throw new GraphRequestError({
    status: res.status,
    graphCode: code,
    graphMessage: message,
    mailboxEmail: ctx.mailboxEmail,
    graphMessageId: ctx.graphMessageId,
    operation,
  })
}

export async function sendGraphReply(
  mailboxEmail: string,
  graphMessageId: string,
  htmlBody: string,
  attachments?: { name: string; url: string }[],
): Promise<string> {
  const token = await getAppGraphToken()
  const base = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxEmail)}/messages`

  const createRes = await fetch(`${base}/${graphMessageId}/createReply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!createRes.ok) await throwStructuredGraphError(createRes, 'createReply', { mailboxEmail, graphMessageId })
  const draft = await createRes.json() as { id: string; internetMessageId: string }

  const patchRes = await fetch(`${base}/${draft.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: { contentType: 'html', content: htmlBody } }),
  })
  if (!patchRes.ok) await throwStructuredGraphError(patchRes, 'patchDraft', { mailboxEmail, graphMessageId: draft.id })

  if (attachments && attachments.length > 0) {
    const fetched: { name: string; bytes: ArrayBuffer }[] = []
    for (const att of attachments) {
      try {
        const r = await fetch(att.url)
        if (!r.ok) { console.warn(`[sendGraphReply] skip attachment ${att.name}: fetch ${r.status}`); continue }
        fetched.push({ name: att.name, bytes: await r.arrayBuffer() })
      } catch (err) {
        console.warn(`[sendGraphReply] skip attachment ${att.name}:`, err)
      }
    }
    const totalBytes = fetched.reduce((s, f) => s + f.bytes.byteLength, 0)
    if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error(`Attachments total size ${totalBytes} exceeds 30 MB limit`)

    for (const f of fetched) {
      const contentBytes = Buffer.from(f.bytes).toString('base64')
      const attRes = await fetch(`${base}/${draft.id}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: f.name,
          contentType: 'application/pdf',
          contentBytes,
        }),
      })
      if (!attRes.ok) console.warn(`[sendGraphReply] attachment upload failed for ${f.name}: ${attRes.status}`)
    }
  }

  const sendRes = await fetch(`${base}/${draft.id}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!sendRes.ok) await throwStructuredGraphError(sendRes, 'sendDraft', { mailboxEmail, graphMessageId: draft.id })

  return draft.internetMessageId
}

export async function fetchGraphMessage(mailboxEmail: string, messageId: string): Promise<GraphMessage> {
  const token = await getAppGraphToken()
  const url = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxEmail)}/messages/${messageId}?$select=${SELECT_FIELDS}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`Graph message fetch failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<GraphMessage>
}
