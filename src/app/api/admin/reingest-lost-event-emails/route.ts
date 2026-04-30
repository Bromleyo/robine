/**
 * ENDPOINT TEMPORAIRE — à retirer après usage post-PR1ter.
 *
 * Re-ingest des emails event@/Inbox depuis 2026-04-28 absents de la DB Robin.
 * Cible le bug webhook fixé en PR1ter (commit 6b5b588).
 *
 * Usage :
 *   curl 'https://y-le-robin.vercel.app/api/admin/reingest-lost-event-emails?x-vercel-protection-bypass=<token>&dry=true'
 *   curl 'https://y-le-robin.vercel.app/api/admin/reingest-lost-event-emails?x-vercel-protection-bypass=<token>&dry=false'
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getAppGraphToken } from '@/lib/graph/auth'
import { fetchGraphMessage, graphMessageToNormalized } from '@/lib/graph/messages'
import { processIncomingEmail } from '@/lib/email/process-incoming'
import { logger } from '@/lib/logger'

const SINCE_ISO = '2026-04-28T00:00:00Z'
const TARGET_MAILBOX = 'event@le-robin.fr'
const RESTAURANT_ID = 'cmoecboxx000104jls85sji8n'

interface GraphInboxMessage {
  id: string
  internetMessageId: string
  subject: string | null
  from: { emailAddress: { address: string; name?: string } }
  receivedDateTime: string
}

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') !== 'false'

  const token = await getAppGraphToken()
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(TARGET_MAILBOX)}/mailFolders/Inbox/messages`
    + `?$select=id,internetMessageId,subject,from,receivedDateTime`
    + `&$top=100&$filter=receivedDateTime ge ${SINCE_ISO}`
    + `&$orderby=receivedDateTime desc`

  const all: GraphInboxMessage[] = []
  let next: string | null = url
  while (next) {
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      return NextResponse.json({ error: 'Graph fetch failed', status: res.status, body: await res.text() }, { status: 502 })
    }
    const data = await res.json() as { value: GraphInboxMessage[]; '@odata.nextLink'?: string }
    all.push(...data.value)
    next = data['@odata.nextLink'] ?? null
  }

  const ids = all.map(m => m.id)
  const inMessages = await prisma.message.findMany({
    where: { microsoftGraphId: { in: ids } },
    select: { microsoftGraphId: true },
  })
  const inRejected = await prisma.rejectedEmail.findMany({
    where: { microsoftGraphId: { in: ids } },
    select: { microsoftGraphId: true },
  })
  const inDb = new Set([
    ...inMessages.map(m => m.microsoftGraphId).filter((id): id is string => !!id),
    ...inRejected.map(r => r.microsoftGraphId),
  ])
  const lost = all.filter(m => !inDb.has(m.id))

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { restaurantId: RESTAURANT_ID, sharedMailboxEmail: TARGET_MAILBOX },
    select: { id: true, email: true, restaurantId: true },
  })
  if (!mailbox) {
    return NextResponse.json({ error: 'mailbox row not found' }, { status: 500 })
  }

  const results: Array<{
    id: string
    fromEmail: string
    subject: string | null
    receivedAt: string
    action: 'reingested' | 'skipped-already-in-db' | 'failed' | 'dry-would-reingest'
    error?: string
  }> = []

  for (const m of all) {
    if (inDb.has(m.id)) {
      results.push({
        id: m.id, fromEmail: m.from.emailAddress.address,
        subject: m.subject, receivedAt: m.receivedDateTime,
        action: 'skipped-already-in-db',
      })
      continue
    }

    if (dry) {
      results.push({
        id: m.id, fromEmail: m.from.emailAddress.address,
        subject: m.subject, receivedAt: m.receivedDateTime,
        action: 'dry-would-reingest',
      })
      continue
    }

    try {
      const graphMsg = await fetchGraphMessage(TARGET_MAILBOX, m.id)
      const email = graphMessageToNormalized(graphMsg)
      await processIncomingEmail(email, mailbox)
      results.push({
        id: m.id, fromEmail: m.from.emailAddress.address,
        subject: m.subject, receivedAt: m.receivedDateTime,
        action: 'reingested',
      })
    } catch (err) {
      logger.error({ err, microsoftGraphId: m.id }, 'reingest failed')
      results.push({
        id: m.id, fromEmail: m.from.emailAddress.address,
        subject: m.subject, receivedAt: m.receivedDateTime,
        action: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    dry,
    totalGraph: all.length,
    inDb: inDb.size,
    lost: lost.length,
    results,
  })
}
