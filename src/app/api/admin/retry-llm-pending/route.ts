import { NextRequest, NextResponse } from 'next/server'
import { getAppGraphToken } from '@/lib/graph/auth'
import { graphMessageToNormalized } from '@/lib/graph/messages'
import { processIncomingEmail } from '@/lib/email/process-incoming'
import { prisma } from '@/lib/db/prisma'
import type { GraphMessage } from '@/lib/graph/messages'

const MAILBOX = 'event@le-robin.fr'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SELECT = [
  'id', 'internetMessageId', 'conversationId', 'subject',
  'from', 'toRecipients', 'ccRecipients', 'body',
  'receivedDateTime', 'internetMessageHeaders',
].join(',')

// POST /api/admin/retry-llm-pending
// Authorization: Bearer <CRON_SECRET>
// Body (optional): { "senders": ["email1@x.com"] }
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { senders?: string[] }
  const senders = body.senders ?? ['alfredo.ariosto@hec.edu', 'sebmerrien@gmail.com']

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { OR: [{ sharedMailboxEmail: MAILBOX }, { email: MAILBOX }] },
    select: { id: true, email: true, restaurantId: true },
  })
  if (!mailbox) return NextResponse.json({ error: `mailbox ${MAILBOX} not found in DB` }, { status: 404 })

  const token = await getAppGraphToken()
  const results: object[] = []

  for (const sender of senders) {
    const filter = encodeURIComponent(`from/emailAddress/address eq '${sender}'`)
    const url = `${GRAPH_BASE}/users/${encodeURIComponent(MAILBOX)}/messages?$filter=${filter}&$select=${SELECT}&$top=10`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      results.push({ sender, status: 'GRAPH_ERROR', detail: `HTTP ${res.status}: ${await res.text()}` })
      continue
    }

    const data = await res.json() as { value: GraphMessage[] }
    if (!data.value.length) {
      results.push({ sender, status: 'NOT_FOUND_IN_MAILBOX' })
      continue
    }

    for (const msg of data.value) {
      const email = graphMessageToNormalized(msg)

      const exists = await prisma.message.findFirst({
        where: { microsoftGraphId: email.providerMessageId },
        select: { id: true, thread: { select: { demandeId: true } } },
      })
      if (exists) {
        results.push({ sender, subject: email.subject, status: 'SKIPPED_DEDUP', demandeId: exists.thread?.demandeId })
        continue
      }

      try {
        await processIncomingEmail(email, mailbox)

        const created = await prisma.message.findFirst({
          where: { microsoftGraphId: email.providerMessageId },
          select: { id: true, thread: { select: { demandeId: true, demande: { select: { reference: true } } } } },
        })

        if (created) {
          results.push({
            sender, subject: email.subject, status: 'ACCEPT',
            demandeId: created.thread?.demandeId,
            reference: created.thread?.demande?.reference,
          })
        } else {
          const rejected = await prisma.rejectedEmail.findFirst({
            where: { microsoftGraphId: email.providerMessageId },
            select: { rejectReason: true },
          })
          results.push({
            sender, subject: email.subject,
            status: rejected ? 'REJECT' : 'LLM_PROCESSED_NO_RECORD',
            rejectReason: rejected?.rejectReason,
          })
        }
      } catch (err) {
        results.push({ sender, subject: email.subject, status: 'ERROR', detail: String(err) })
      }
    }
  }

  return NextResponse.json({ results })
}
