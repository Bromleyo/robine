/**
 * Rétro-loggue dans rejected_emails les emails LLM-rejetés lors du batch du 2026-04-29
 * qui n'ont pas été tracés (bug : logRejectedEmail conditionnel sur softRejectReason).
 *
 * Logique : récupère les emails Graph depuis `since`, exclut ceux déjà dans
 * message ou rejected_emails, puis insère les restants avec rejectReason='llm_reject'.
 *
 * Usage:
 *   npx tsx scripts/retro-log-llm-rejects.ts              # dry-run
 *   npx tsx scripts/retro-log-llm-rejects.ts --execute    # insertion réelle
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

import { getAppGraphToken } from '../src/lib/graph/auth'
import { graphMessageToNormalized } from '../src/lib/graph/messages'
import type { GraphMessage } from '../src/lib/graph/messages'

const MAILBOX = 'info@le-robin.fr'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SELECT = [
  'id', 'internetMessageId', 'conversationId', 'subject',
  'from', 'toRecipients', 'ccRecipients', 'body',
  'receivedDateTime', 'internetMessageHeaders',
].join(',')
const SINCE = '2026-04-01'
const RETRO_DETAILS = 'retro_log_2026-04-29'

const isDryRun = !process.argv.includes('--execute')

void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { OR: [{ sharedMailboxEmail: MAILBOX }, { email: MAILBOX }] },
    select: { id: true, email: true, restaurantId: true },
  })
  if (!mailbox) { console.error('Mailbox not found'); process.exit(1) }

  console.log(`Fetching Graph messages since ${SINCE}…`)
  const token = await getAppGraphToken()
  const sinceDate = new Date(`${SINCE}T00:00:00Z`)

  const allMessages: GraphMessage[] = []
  let url: string | null =
    `${GRAPH_BASE}/users/${encodeURIComponent(MAILBOX)}/messages`
    + `?$select=${SELECT}&$top=100`
    + `&$orderby=receivedDateTime%20asc`
    + `&$filter=${encodeURIComponent(`receivedDateTime ge ${sinceDate.toISOString()}`)}`

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { console.error('Graph error:', res.status, await res.text()); process.exit(1) }
    const data = await res.json() as { value: GraphMessage[]; '@odata.nextLink'?: string }
    allMessages.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }
  console.log(`Fetched: ${allMessages.length} messages`)

  const allGraphIds = allMessages.map(m => m.id)
  const [inMessages, inRejected] = await Promise.all([
    prisma.message.findMany({ where: { microsoftGraphId: { in: allGraphIds } }, select: { microsoftGraphId: true } }),
    prisma.rejectedEmail.findMany({ where: { microsoftGraphId: { in: allGraphIds } }, select: { microsoftGraphId: true } }),
  ])
  const alreadyTracked = new Set([
    ...inMessages.map((m: { microsoftGraphId: string | null }) => m.microsoftGraphId),
    ...inRejected.map((r: { microsoftGraphId: string }) => r.microsoftGraphId),
  ])

  const untracked = allMessages.filter(m =>
    m.from?.emailAddress?.address &&
    m.from.emailAddress.address.toLowerCase() !== MAILBOX.toLowerCase() &&
    !alreadyTracked.has(m.id),
  )

  console.log(`Already tracked: ${alreadyTracked.size} | To retro-log: ${untracked.length}`)

  if (isDryRun) {
    console.log('\nDRY RUN — sample of 10:')
    untracked.slice(0, 10).forEach(m =>
      console.log(` ${m.from?.emailAddress?.address} | ${(m.subject ?? '').slice(0, 60)}`)
    )
    console.log('\nPass --execute to insert into rejected_emails.')
    process.exit(0)
  }

  let inserted = 0
  let skipped = 0
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
      inserted++
    } catch {
      skipped++
    }
  }

  console.log(`Done. Inserted: ${inserted} | Skipped (unique conflict): ${skipped}`)
  await prisma.$disconnect()
})()
