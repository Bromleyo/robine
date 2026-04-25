import { getAppGraphToken } from './auth'
import type { NormalizedEmail } from '@/lib/email/types'
import { htmlToText } from '@/lib/email/html-to-text'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export function graphMessageToNormalized(msg: GraphMessage): NormalizedEmail {
  const headers: Record<string, string> = {}
  for (const h of msg.internetMessageHeaders ?? []) {
    headers[h.name.toLowerCase()] = h.value
  }
  const bodyHtml = msg.body.contentType === 'html' ? msg.body.content : null
  const bodyText = bodyHtml ? htmlToText(bodyHtml) : msg.body.content
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

export async function sendGraphReply(
  mailboxEmail: string,
  graphMessageId: string,
  htmlBody: string,
): Promise<string> {
  const token = await getAppGraphToken()
  const base = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxEmail)}/messages`

  const createRes = await fetch(`${base}/${graphMessageId}/createReply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!createRes.ok) throw new Error(`createReply failed (${createRes.status}): ${await createRes.text()}`)
  const draft = await createRes.json() as { id: string; internetMessageId: string }

  const patchRes = await fetch(`${base}/${draft.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: { contentType: 'html', content: htmlBody } }),
  })
  if (!patchRes.ok) throw new Error(`patch draft failed (${patchRes.status}): ${await patchRes.text()}`)

  const sendRes = await fetch(`${base}/${draft.id}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!sendRes.ok) throw new Error(`send failed (${sendRes.status}): ${await sendRes.text()}`)

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
