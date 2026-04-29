import { NextRequest, NextResponse } from 'next/server'
import { getAppGraphToken } from '@/lib/graph/auth'
import { graphMessageToNormalized } from '@/lib/graph/messages'
import { processIncomingEmail } from '@/lib/email/process-incoming'
import { prisma } from '@/lib/db/prisma'
import type { GraphMessage } from '@/lib/graph/messages'

const MAILBOX = 'info@le-robin.fr'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SELECT = [
  'id', 'internetMessageId', 'conversationId', 'subject',
  'from', 'toRecipients', 'ccRecipients', 'body',
  'receivedDateTime', 'internetMessageHeaders',
].join(',')
const PAGE_SIZE = 100

// POST /api/admin/retry-llm-from-info
// Authorization: Bearer <CRON_SECRET>
// Body (optional): { "since": "2026-04-01", "limit": 200 }
//
// Fetches all messages from info@le-robin.fr since `since`, deduplicates against
// message + rejectedEmail tables, then processes the untracked ones via the full
// email pipeline (filter → LLM). Designed to recover the ~180 emails that errored
// on 2026-04-29 when ANTHROPIC_API_KEY was empty in the local import script.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { since?: string; limit?: number }
  const since = body.since ?? '2026-04-01'
  const limit = body.limit ?? 500
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
    + `?$select=${SELECT}&$top=${PAGE_SIZE}`
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

  const unprocessed = allMessages.filter(m =>
    m.from?.emailAddress?.address &&
    m.from.emailAddress.address.toLowerCase() !== MAILBOX.toLowerCase() &&
    !alreadyTracked.has(m.id),
  ).slice(0, limit)

  // ── Process untracked emails ──────────────────────────────────────────────────

  const counters = {
    fetched: allMessages.length,
    alreadyTracked: alreadyTracked.size,
    toProcess: unprocessed.length,
    accepted: 0,
    rejected: 0,
    error: 0,
  }

  type Detail = {
    from: string
    subject: string | null
    status: 'ACCEPT' | 'REJECT' | 'ERROR'
    reference?: string | null
    rejectReason?: string | null
    detail?: string
  }
  const details: Detail[] = []

  for (const msg of unprocessed) {
    const email = graphMessageToNormalized(msg)

    try {
      await processIncomingEmail(email, mailbox)

      const created = await prisma.message.findFirst({
        where: { microsoftGraphId: email.providerMessageId },
        select: { id: true, thread: { select: { demande: { select: { reference: true } } } } },
      })

      if (created) {
        counters.accepted++
        details.push({
          from: email.from.address,
          subject: email.subject,
          status: 'ACCEPT',
          reference: created.thread?.demande?.reference ?? null,
        })
      } else {
        const rejected = await prisma.rejectedEmail.findFirst({
          where: { microsoftGraphId: email.providerMessageId },
          select: { rejectReason: true },
        })
        counters.rejected++
        details.push({
          from: email.from.address,
          subject: email.subject,
          status: 'REJECT',
          rejectReason: rejected?.rejectReason ?? null,
        })
      }
    } catch (err) {
      counters.error++
      details.push({
        from: email.from.address,
        subject: email.subject,
        status: 'ERROR',
        detail: String(err).slice(0, 300),
      })
    }
  }

  return NextResponse.json({ since, counters, details })
}
