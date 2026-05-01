/**
 * Tâche 4 PR5 — Investigation Bug 2 (perte des retours à la ligne).
 *
 * Compare le body retourné par Microsoft Graph SANS et AVEC le header
 *   Prefer: outlook.body-content-type="text"
 * sur le message problématique cmole2d4b... (HTML source = un seul <span>
 * sans structure de paragraphes).
 *
 * Usage: npx tsx scripts/test-graph-text-body.ts [messageDbId]
 *
 * AUCUNE modification du pipeline d'ingest. Read-only Graph + DB.
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

import { getAppGraphToken } from '../src/lib/graph/auth'
import { resolveTargetMailbox } from '../src/lib/graph/webhook-helpers'

const TARGET_MESSAGE_ID = process.argv[2] ?? 'cmole2d4b000304jxikqu87tf'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  const message = await prisma.message.findUnique({
    where: { id: TARGET_MESSAGE_ID },
    select: {
      id: true,
      microsoftGraphId: true,
      fromEmail: true,
      receivedAt: true,
      thread: {
        select: {
          demande: {
            select: {
              restaurantId: true,
              restaurant: {
                select: {
                  mailboxes: {
                    where: { actif: true },
                    select: { email: true, sharedMailboxEmail: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!message) {
    console.error(`Message not found: ${TARGET_MESSAGE_ID}`)
    process.exit(1)
  }
  if (!message.microsoftGraphId) {
    console.error(`Message has no microsoftGraphId: ${TARGET_MESSAGE_ID}`)
    process.exit(1)
  }
  const mailbox = message.thread.demande.restaurant.mailboxes[0]
  if (!mailbox) {
    console.error('No active mailbox for this restaurant')
    process.exit(1)
  }
  const targetMailbox = resolveTargetMailbox(mailbox)

  console.log(`\n== Investigation Bug 2 ==`)
  console.log(`Message DB id      : ${message.id}`)
  console.log(`From               : ${message.fromEmail}`)
  console.log(`Received           : ${message.receivedAt.toISOString()}`)
  console.log(`microsoftGraphId   : ${message.microsoftGraphId}`)
  console.log(`Mailbox cible      : ${targetMailbox}`)
  console.log()

  const token = await getAppGraphToken()
  const url = `${GRAPH_BASE}/users/${encodeURIComponent(targetMailbox)}/messages/${message.microsoftGraphId}?$select=id,body`

  async function fetchVariant(label: string, prefer?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (prefer) headers['Prefer'] = prefer

    const res = await fetch(url, { method: 'GET', headers })
    if (!res.ok) {
      console.log(`[${label}] Graph error ${res.status}: ${await res.text()}`)
      return
    }
    const data = await res.json() as { id: string; body: { contentType: string; content: string } }
    const content = data.body.content ?? ''
    const lfCount = (content.match(/\n/g) ?? []).length
    const crlfCount = (content.match(/\r\n/g) ?? []).length
    const brCount = (content.match(/<br/gi) ?? []).length
    const pCount = (content.match(/<p[\s>]/gi) ?? []).length
    const divCount = (content.match(/<div[\s>]/gi) ?? []).length

    console.log(`─── ${label} ─────────────────────────────────────────`)
    if (prefer) console.log(`Prefer header        : ${prefer}`)
    console.log(`body.contentType     : ${data.body.contentType}`)
    console.log(`length               : ${content.length} chars`)
    console.log(`count "\\n"           : ${lfCount}`)
    console.log(`count "\\r\\n"         : ${crlfCount}`)
    console.log(`count <br...>        : ${brCount}`)
    console.log(`count <p...>         : ${pCount}`)
    console.log(`count <div...>       : ${divCount}`)
    console.log(`content (1000 first chars):`)
    console.log(JSON.stringify(content.slice(0, 1000)))
    console.log()
  }

  await Promise.all([
    fetchVariant('A — Sans Prefer (comportement actuel)'),
    fetchVariant('B — Avec Prefer text/plain', 'outlook.body-content-type="text"'),
  ])

  await prisma.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
