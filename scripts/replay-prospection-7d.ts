/**
 * Replay rétroactif (read-only) de checkBusinessSignals sur les rejected_emails
 * 'prospection' des 7 derniers jours, pour évaluer l'impact du refactor
 * STRONG/WEAK avant déploiement.
 *
 * Limite : on rejoue avec `bodySnippet` (tronqué) — donc certains matchs
 * possibles plus loin dans le corps peuvent être manqués. Acceptable pour
 * un screening rapide.
 *
 * Usage: npx tsx scripts/replay-prospection-7d.ts
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

import { checkBusinessSignals } from '../src/lib/email-filter/layer3-business'
import type { NormalizedEmail } from '../src/lib/email/types'

void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const rows = await prisma.rejectedEmail.findMany({
    where: {
      rejectReason: 'prospection',
      receivedAt: { gte: since },
    },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      fromEmail: true,
      fromName: true,
      subject: true,
      details: true,
      bodySnippet: true,
      receivedAt: true,
    },
  })

  console.log(`\n${rows.length} rejected_emails 'prospection' depuis ${since.toISOString()}\n`)

  type Verdict = 'REJECT' | 'LLM' | 'ACCEPT'
  const stats = { REJECT: 0, LLM: 0, ACCEPT: 0 } as Record<Verdict, number>
  const candidates: Array<{
    id: string
    receivedAt: string
    from: string
    subject: string
    oldDetails: string
    newVerdict: Verdict
    newReason: string
    newSoftReject?: string
  }> = []

  for (const r of rows) {
    const email: NormalizedEmail = {
      providerMessageId: r.id,
      internetMessageId: `<replay-${r.id}@local>`,
      conversationId: r.id,
      subject: r.subject ?? '',
      from: { address: r.fromEmail, name: r.fromName ?? '' },
      toRecipients: [],
      ccRecipients: [],
      bodyHtml: null,
      bodyText: r.bodySnippet ?? '',
      receivedAt: r.receivedAt,
      headers: {},
      inReplyTo: null,
      references: [],
    }

    const decision = checkBusinessSignals(email, r.bodySnippet ?? '')
    const verdict: Verdict =
      decision.action === 'reject'
        ? 'REJECT'
        : decision.action === 'send_to_llm'
          ? 'LLM'
          : 'ACCEPT'

    stats[verdict]++

    if (verdict !== 'REJECT') {
      candidates.push({
        id: r.id,
        receivedAt: r.receivedAt.toISOString().slice(0, 16).replace('T', ' '),
        from: r.fromEmail,
        subject: (r.subject ?? '').slice(0, 60),
        oldDetails: r.details ?? '',
        newVerdict: verdict,
        newReason: decision.action === 'reject' ? decision.rejectReason : decision.reason,
        newSoftReject: decision.action === 'send_to_llm' ? decision.softRejectReason : undefined,
      })
    }
  }

  console.log('─── Stats ───────────────────────────────')
  console.log(`Toujours REJECT    : ${stats.REJECT}`)
  console.log(`Bascule vers LLM   : ${stats.LLM}`)
  console.log(`Bascule vers ACCEPT: ${stats.ACCEPT}`)
  console.log(`Total candidats à revoir : ${candidates.length}`)
  console.log()

  if (candidates.length === 0) {
    console.log('Aucun candidat — le refactor ne change rien sur les 7 derniers jours.')
    await prisma.$disconnect()
    process.exit(0)
  }

  console.log('─── Candidats (CSV) ─────────────────────')
  console.log('id,receivedAt,from,subject,oldDetails,newVerdict,newReason,newSoftReject')
  for (const c of candidates) {
    const fields = [
      c.id,
      c.receivedAt,
      c.from,
      c.subject.replace(/[",\n\r]/g, ' '),
      c.oldDetails.replace(/[",\n\r]/g, ' '),
      c.newVerdict,
      c.newReason,
      (c.newSoftReject ?? '').replace(/[",\n\r]/g, ' '),
    ]
    console.log(fields.map(f => `"${f}"`).join(','))
  }
  console.log()

  console.log('─── Candidats (table lisible) ───────────')
  for (const c of candidates) {
    console.log(`[${c.newVerdict}] ${c.receivedAt}  ${c.from}`)
    console.log(`  subject : ${c.subject}`)
    console.log(`  ancien rejet : ${c.oldDetails}`)
    console.log(`  nouveau     : ${c.newReason}${c.newSoftReject ? ` — ${c.newSoftReject}` : ''}`)
    console.log()
  }

  await prisma.$disconnect()
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
