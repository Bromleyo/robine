/**
 * Audit debug de la boîte event@le-robin.fr
 * Usage: npx tsx scripts/debug-event-mailbox.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { filterEmailDebug } from '../src/lib/email-filter/debug'
import { htmlToText, stripQuotedReply } from '../src/lib/email/html-to-text'
import type { FilterDebugResult } from '../src/lib/email-filter/debug'

const MAILBOX = 'event@le-robin.fr'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// ── Auth ─────────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const tenantId = process.env.AZURE_AD_TENANT_ID
  const clientId = process.env.AZURE_AD_CLIENT_ID
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET in .env.local')
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  const data = await res.json() as { access_token: string }
  return data.access_token
}

// ── Fetch messages ────────────────────────────────────────────────────────────

interface GraphMsg {
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

async function fetchMessages(token: string): Promise<GraphMsg[]> {
  const select = [
    'id', 'internetMessageId', 'conversationId', 'subject',
    'from', 'toRecipients', 'ccRecipients', 'body',
    'receivedDateTime', 'internetMessageHeaders',
  ].join(',')

  const endpoint = `${GRAPH_BASE}/users/${encodeURIComponent(MAILBOX)}/messages`
    + `?$select=${select}&$top=30&$orderby=receivedDateTime%20desc`

  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Graph list failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { value: GraphMsg[] }
  return data.value ?? []
}

// ── Normalize to NormalizedEmail ──────────────────────────────────────────────

function toNormalized(msg: GraphMsg) {
  const headers: Record<string, string> = {}
  for (const h of msg.internetMessageHeaders ?? []) headers[h.name.toLowerCase()] = h.value
  const isHtml = msg.body.contentType.toLowerCase() === 'html'
  const bodyText = stripQuotedReply(isHtml ? htmlToText(msg.body.content) : msg.body.content)
  return {
    providerMessageId: msg.id,
    internetMessageId: msg.internetMessageId ?? msg.id,
    conversationId: msg.conversationId ?? null,
    subject: msg.subject ?? null,
    from: { address: msg.from.emailAddress.address.toLowerCase(), name: msg.from.emailAddress.name || null },
    toRecipients: msg.toRecipients.map(r => r.emailAddress.address.toLowerCase()),
    ccRecipients: msg.ccRecipients.map(r => r.emailAddress.address.toLowerCase()),
    bodyHtml: isHtml ? msg.body.content : null,
    bodyText,
    receivedAt: new Date(msg.receivedDateTime),
    headers,
    inReplyTo: headers['in-reply-to'] ?? null,
    references: headers['references']?.split(/\s+/).filter(Boolean) ?? [],
  }
}

// ── Markdown rendering ────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function badge(action: string): string {
  if (action === 'accept_direct') return 'ACCEPT'
  if (action === 'send_to_llm') return 'LLM'
  return 'REJECT'
}

function renderTable(results: FilterDebugResult[]): string {
  const lines: string[] = [
    '| # | Date | De | Sujet | L1 | L2 | Forts | Moyens | Date? | Inv. | Prosp? | Décision |',
    '|---|------|----|-------|----|-----|-------|--------|-------|------|--------|----------|',
  ]

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!
    const date = r.receivedAt.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
    const from = esc(r.from)
    const subject = esc((r.subject ?? '(sans sujet)').slice(0, 45))

    const l1 = r.layer1.passed ? 'OK' : `KO: ${'rejectReason' in r.layer1.decision ? r.layer1.decision.rejectReason : ''}`
    const l2 = !r.layer1.passed
      ? '—'
      : r.layer2.passed
        ? 'OK'
        : `KO: ${'rejectReason' in r.layer2.decision ? r.layer2.decision.rejectReason : ''}`

    const forts  = esc(r.layer3?.matchedStrong.join(', ') || '—')
    const moyens = esc(r.layer3?.matchedMedium.join(', ') || '—')
    const hasDate = r.layer3?.dateDetected ? 'oui' : '—'
    const guests  = r.layer3?.guestCount != null ? String(r.layer3.guestCount) : '—'
    const prosp   = r.layer3?.prospectionPhrase
      ? esc(`"${r.layer3.prospectionPhrase.slice(0, 25)}…"`)
      : '—'

    lines.push(`| ${i + 1} | ${date} | ${from} | ${subject} | ${l1} | ${l2} | ${forts} | ${moyens} | ${hasDate} | ${guests} | ${prosp} | **${badge(r.finalAction)}** |`)
  }

  return lines.join('\n')
}

function renderDetails(results: FilterDebugResult[]): string {
  const blocks: string[] = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!
    const lines: string[] = [
      `### #${i + 1} — ${r.subject ?? '(sans sujet)'}`,
      `**De :** ${r.from}`,
      `**Reçu :** ${r.receivedAt.toLocaleString('fr-FR')}`,
      `**Décision :** ${badge(r.finalAction)} — ${r.finalReason}${r.finalDetails ? ` _(${r.finalDetails})_` : ''}`,
      '',
      `> ${r.snippet}`,
    ]
    if (r.layer3) {
      lines.push('')
      if (r.layer3.matchedStrong.length) lines.push(`- **Mots forts :** ${r.layer3.matchedStrong.join(', ')}`)
      if (r.layer3.matchedMedium.length) lines.push(`- **Mots moyens :** ${r.layer3.matchedMedium.join(', ')}`)
      if (r.layer3.dateDetected) lines.push(`- **Date future :** détectée`)
      if (r.layer3.guestCount != null) lines.push(`- **Invités :** ${r.layer3.guestCount}`)
      if (r.layer3.prospectionPhrase) lines.push(`- **Phrase prospection :** "${r.layer3.prospectionPhrase}"`)
      if (r.layer3.blacklistedDomain) lines.push(`- **Domaine blacklisté :** ${r.layer3.blacklistedDomain}`)
    }
    blocks.push(lines.join('\n'))
  }

  return blocks.join('\n\n---\n\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

void (async () => {
  const token = await getToken()
  process.stderr.write(`[✓] Token obtenu — récupération des 30 derniers emails de ${MAILBOX}…\n`)

  const messages = await fetchMessages(token)
  process.stderr.write(`[✓] ${messages.length} emails récupérés\n`)

  const results = messages.map(msg => filterEmailDebug(toNormalized(msg), MAILBOX))

  const accepted = results.filter(r => r.finalAction === 'accept_direct').length
  const llm      = results.filter(r => r.finalAction === 'send_to_llm').length
  const rejected = results.filter(r => r.finalAction === 'reject').length

  console.log(`# Audit filtrage — ${MAILBOX}`)
  console.log(`_Analysé le ${new Date().toLocaleString('fr-FR')} — ${results.length} emails : ${accepted} acceptés, ${llm} → LLM, ${rejected} rejetés_\n`)
  console.log(renderTable(results))
  console.log('\n---\n')
  console.log('## Détail par email\n')
  console.log(renderDetails(results))
})()
