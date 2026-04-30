/**
 * Re-parse rétroactif du bodyText des messages IN.
 *
 * Pour chaque message entrant avec bodyHtml non-null, recalcule
 *   newBodyText = stripQuotedReply(htmlToText(bodyHtml))
 * et l'écrit à la place du bodyText courant si différent.
 *
 * Idempotent : si newBodyText === current bodyText → no-op.
 *
 * Usage :
 *   npx tsx scripts/reparse-message-bodies.ts             # dry-run
 *   npx tsx scripts/reparse-message-bodies.ts --execute   # applique les updates
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

import { htmlToText, stripQuotedReply } from '../src/lib/email/html-to-text'

const isDryRun = !process.argv.includes('--execute')
const RESTAURANT_ID = 'cmoecboxx000104jls85sji8n'
const SAMPLE_LIMIT = 5

void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  const messages = await prisma.message.findMany({
    where: {
      direction: 'IN',
      bodyHtml: { not: '' },
      thread: { demande: { restaurantId: RESTAURANT_ID } },
    },
    select: { id: true, fromEmail: true, createdAt: true, bodyHtml: true, bodyText: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[reparse] mode      : ${isDryRun ? 'DRY-RUN (no DB writes)' : 'EXECUTE (DB writes ON)'}`)
  console.log(`[reparse] restaurant: ${RESTAURANT_ID}`)
  console.log(`[reparse] scanned   : ${messages.length} messages IN avec bodyHtml`)

  let changed = 0
  let unchanged = 0
  const samples: Array<{
    id: string; from: string; createdAt: string;
    oldLen: number; newLen: number; oldTail: string; newTail: string;
  }> = []

  for (const msg of messages) {
    const html = msg.bodyHtml ?? ''
    if (!html) { unchanged++; continue }
    const newBodyText = stripQuotedReply(htmlToText(html))
    const currentBodyText = msg.bodyText ?? ''

    if (newBodyText === currentBodyText) {
      unchanged++
      continue
    }

    changed++

    if (samples.length < SAMPLE_LIMIT) {
      const tail = (s: string) => s.slice(Math.max(0, s.length - 80)).replace(/\n/g, ' ⏎ ')
      samples.push({
        id: msg.id,
        from: msg.fromEmail,
        createdAt: msg.createdAt.toISOString(),
        oldLen: currentBodyText.length,
        newLen: newBodyText.length,
        oldTail: tail(currentBodyText),
        newTail: tail(newBodyText),
      })
    }

    if (!isDryRun) {
      await prisma.message.update({
        where: { id: msg.id },
        data: { bodyText: newBodyText },
      })
    }
  }

  console.log(`[reparse] result    : changed=${changed} | unchanged=${unchanged} | total=${messages.length}`)

  if (samples.length) {
    console.log('\n[reparse] samples (avant → après, last 80 chars) :')
    for (const s of samples) {
      console.log(`  • ${s.id} ${s.createdAt} ${s.from}`)
      console.log(`      bodyText length : ${s.oldLen} → ${s.newLen}`)
      console.log(`      old tail : ${s.oldTail}`)
      console.log(`      new tail : ${s.newTail}`)
    }
  }

  if (isDryRun && changed > 0) {
    console.log(`\n[reparse] dry-run terminé. Pour appliquer : npx tsx scripts/reparse-message-bodies.ts --execute`)
  } else if (!isDryRun && changed > 0) {
    console.log(`\n[reparse] OK — ${changed} messages mis à jour en DB.`)
  } else {
    console.log(`\n[reparse] aucune modif nécessaire.`)
  }

  process.exit(0)
})().catch(err => {
  console.error('[reparse] échec:', err)
  process.exit(1)
})
