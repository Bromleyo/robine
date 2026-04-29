import { NextRequest, NextResponse } from 'next/server'
import { getAppGraphToken } from '@/lib/graph/auth'
import { graphMessageToNormalized } from '@/lib/graph/messages'
import { prisma } from '@/lib/db/prisma'
import type { GraphMessage } from '@/lib/graph/messages'

const MAILBOX = 'info@le-robin.fr'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SELECT = [
  'id', 'internetMessageId', 'conversationId', 'subject',
  'from', 'toRecipients', 'ccRecipients', 'body',
  'receivedDateTime', 'internetMessageHeaders',
].join(',')
const RETRO_DETAILS = 'retro_log_2026-04-29'

// POST /api/admin/retro-log-llm-rejects
// Authorization: Bearer <CRON_SECRET>
// Body: { "since": "YYYY-MM-DD", "execute": false }
//
// Fetches all Graph messages since `since`, excludes already-tracked entries
// (message + rejected_emails), then inserts the remaining ones as llm_reject.
// execute: false → dry-run (no DB writes). execute: true → real insertion.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { since?: string; execute?: boolean }
  const since = body.since ?? '2026-04-01'
  const execute = body.execute === true
  const sinceDate = new Date(`${since}T00:00:00Z`)

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { OR: [{ sharedMailboxEmail: MAILBOX }, { email: MAILBOX }] },
    select: { id: true, email: true, restaurantId: true },
  })
  if (!mailbox) {
    return NextResponse.json({ error: `mailbox ${MAILBOX} not found in DB` }, { status: 404 })
  }

  const token = await getAppGraphToken()

  // ── Fetch all messages since date ────────────────────────────────────────────

  const allMessages: GraphMessage[] = []
  let url: string | null =
    `${GRAPH_BASE}/users/${encodeURIComponent(MAILBOX)}/messages`
    + `?$select=${SELECT}&$top=100`
    + `&$orderby=receivedDateTime%20asc`
    + `&$filter=${encodeURIComponent(`receivedDateTime ge ${sinceDate.toISOString()}`)}`

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Graph fetch failed: HTTP ${res.status}: ${await res.text()}` },
        { status: 502 },
      )
    }
    const data = await res.json() as { value: GraphMessage[]; '@odata.nextLink'?: string }
    allMessages.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }

  // ── Batch dedup against message + rejectedEmail ──────────────────────────────

  const allGraphIds = allMessages.map(m => m.id)

  const [inMessages, inRejected] = await Promise.all([
    prisma.message.findMany({
      where: { microsoftGraphId: { in: allGraphIds } },
      select: { microsoftGraphId: true },
    }),
    prisma.rejectedEmail.findMany({
      where: { microsoftGraphId: { in: allGraphIds } },
      select: { microsoftGraphId: true },
    }),
  ])

  const alreadyTracked = new Set([
    ...inMessages.map(m => m.microsoftGraphId),
    ...inRejected.map(r => r.microsoftGraphId),
  ])

  const untracked = allMessages.filter(m =>
    m.from?.emailAddress?.address &&
    m.from.emailAddress.address.toLowerCase() !== MAILBOX.toLowerCase() &&
    !alreadyTracked.has(m.id),
  )

  // ── Dry-run: return counters + sample ───────────────────────────────────────

  type Detail = {
    from: string
    subject: string | null
    receivedAt: string
    status: 'WOULD_INSERT' | 'INSERTED' | 'ERROR'
    error?: string
  }

  if (!execute) {
    const sample = untracked.slice(0, 20).map(m => ({
      from: m.from?.emailAddress?.address ?? '?',
      subject: m.subject ?? null,
      receivedAt: m.receivedDateTime,
      status: 'WOULD_INSERT' as const,
    }))
    return NextResponse.json({
      since,
      execute: false,
      counters: {
        fetched: allMessages.length,
        alreadyLogged: alreadyTracked.size,
        toRetroLog: untracked.length,
      },
      sample,
    })
  }

  // ── Execute: insert untracked as llm_reject ──────────────────────────────────

  const details: Detail[] = []
  let retroLogged = 0
  let errors = 0

  for (const msg of untracked) {
    const email = graphMessageToNormalized(msg)
    try {
      await prisma.rejectedEmail.create({
        data: {
          restaurantId: mailbox.restaurantId,
          mailboxId: mailbox.id,
          microsoftGraphId: email.providerMessageId,
          fromEmail: email.from.address,
          fromName: email.from.name ?? null,
          subject: email.subject ?? null,
          rejectReason: 'llm_reject',
          details: RETRO_DETAILS,
          bodySnippet: email.bodyText.slice(0, 400),
          receivedAt: email.receivedAt,
        },
      })
      retroLogged++
      details.push({
        from: email.from.address,
        subject: email.subject,
        receivedAt: msg.receivedDateTime,
        status: 'INSERTED',
      })
    } catch (err) {
      errors++
      details.push({
        from: email.from.address,
        subject: email.subject,
        receivedAt: msg.receivedDateTime,
        status: 'ERROR',
        error: String(err).slice(0, 200),
      })
    }
  }

  return NextResponse.json({
    since,
    execute: true,
    counters: {
      fetched: allMessages.length,
      alreadyLogged: alreadyTracked.size,
      retroLogged,
      errors,
    },
    details,
  })
}
