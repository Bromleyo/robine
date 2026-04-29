/**
 * ÉTAPE 0 — Tri automatique des 35 demandes uniques cmo9zkt
 * Read-only. Aucune modification DB.
 *
 * Usage: npx tsx scripts/triage-cmo9zkt.ts
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

// ── Critères Lot B ───────────────────────────────────────────────────────────

const LOT_B_PATTERNS = [
  /noreply/i, /no-reply/i, /ne-pas-repondre/i,
  /^notifications@/i, /^campaigns@/i, /^bonjour@e\./i,
  /make-events/i, /^webmaster-/i,
  /^shop@mail\./i,             // shop@mail.gilac.com (distrib alimentaire)
  /@n\.[a-z0-9-]+\.[a-z]{2,}$/i, // @n.retif.eu (ESP fournisseur)
]
const LOT_B_WILDCARD_DOMAINS = ['bizay.com']
const LOT_B_EMAILS = [
  'jimmy.dubreuil@gmail.com',
  'cachaca.rio@gmail.com',
]
const LOT_B_PROSPECTION_DOMAINS = [
  'hubspot.com', 'mailchimp.com', 'sendinblue.com', 'brevo.com',
  'lemlist.com', 'woodpecker.co', 'outreach.io', 'salesloft.com',
  'apollo.io', 'sellsy.com', 'pipedrive.com', 'mixmax.com',
  'reply.io', 'mailshake.com', 'snov.io', 'hunter.io',
  'lafourchette.com', 'thefork.com', 'yelp.com', 'tripadvisor.fr', 'tripadvisor.com',
  'getresponse.com', 'activecampaign.com', 'klaviyo.com',
  'constantcontact.com', 'campaignmonitor.com',
  'eurovolailles.fr', 'iscod.fr', 'proweltek.com',
  'habitium.com', 'piecesauto24.com', 'em.edenred.fr',
  'acms.asso.fr',
  'paypal.fr', 'paypal.com',
  'ledelas.fr',
]

// Doublons connus — traités séparément, exclus du tri
const DUPLICATES_CMO9ZKT = ['DR-0023', 'DR-0024']

type Lot = 'A' | 'B' | 'SUPPR'

function classify(email: string, messageCount: number): { lot: Lot; reason: string } {
  if (messageCount === 0) return { lot: 'SUPPR', reason: '0 messages' }

  const lower = email.toLowerCase()
  const domain = lower.split('@')[1] ?? ''

  if (LOT_B_EMAILS.includes(lower))
    return { lot: 'B', reason: `blacklist: ${email}` }
  if (LOT_B_PATTERNS.some(p => p.test(lower)))
    return { lot: 'B', reason: `pattern noreply/auto: ${email}` }
  if (LOT_B_WILDCARD_DOMAINS.some(d => domain.endsWith(d)))
    return { lot: 'B', reason: `domaine spam: ${domain}` }
  if (LOT_B_PROSPECTION_DOMAINS.includes(domain))
    return { lot: 'B', reason: `prospection_domain: ${domain}` }

  return { lot: 'A', reason: 'demande humaine présumée' }
}

// IDs confirmés (diagnostic session 2026-04-29)
const GHOST_ID = 'cmo9zkt1300014awax5p8izzb'       // slug: le-robin-1776858339054, 37 demandes
const SURVIVANT_ID = 'cmoecboxx000104jls85sji8n'   // slug: le-robin-1777121613569, 23 demandes

// ── Main ─────────────────────────────────────────────────────────────────────

void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  const ghost = await prisma.restaurant.findUnique({
    where: { id: GHOST_ID },
    select: { id: true, slug: true, referenceSeq: true },
  })
  const survivant = await prisma.restaurant.findUnique({
    where: { id: SURVIVANT_ID },
    select: { id: true, slug: true, referenceSeq: true },
  })
  if (!ghost || !survivant) { console.error('Restaurant introuvable — vérifier les IDs'); process.exit(1) }

  const ghostCount = await prisma.demande.count({ where: { restaurantId: ghost.id } })
  const survivantCount = await prisma.demande.count({ where: { restaurantId: survivant.id } })

  console.log(`Ghost      : ${ghost.id} (${ghost.slug}) — seq ${ghost.referenceSeq}, ${ghostCount} demandes`)
  console.log(`Survivant  : ${survivant.id} (${survivant.slug}) — seq ${survivant.referenceSeq}, ${survivantCount} demandes`)
  console.log(`\nGhost cible (cmo9zkt) : ${ghost.id} (${ghost.slug})`)

  // Récupérer demandes ghost hors doublons
  const demandes = await prisma.demande.findMany({
    where: {
      restaurantId: GHOST_ID,
      reference: { notIn: DUPLICATES_CMO9ZKT },
    },
    select: {
      id: true,
      reference: true,
      statut: true,
      contact: { select: { email: true, nom: true } },
      threads: {
        select: {
          messages: {
            select: { id: true, direction: true, fromEmail: true },
          },
        },
      },
    },
    orderBy: { reference: 'asc' },
  })

  console.log(`\n── Rapport de tri (${demandes.length} demandes hors ${DUPLICATES_CMO9ZKT.length} doublons) ──────────────────\n`)

  type Row = { ref: string; email: string; msgCount: number; lot: Lot; reason: string }
  const rows: Row[] = []

  for (const d of demandes) {
    const msgCount = d.threads.reduce((n, t) => n + t.messages.length, 0)
    const email = d.contact?.email ?? '?'
    const { lot, reason } = classify(email, msgCount)
    rows.push({ ref: d.reference, email, msgCount, lot, reason })
  }

  // Tableau détaillé
  const P = (s: string, n: number) => s.padEnd(n)
  console.log(`${P('Ref', 10)} ${P('Lot', 5)} ${P('Msgs', 5)} ${P('Email', 42)} Raison`)
  console.log('─'.repeat(120))
  for (const r of rows) {
    console.log(`${P(r.ref, 10)} ${P(r.lot, 5)} ${P(String(r.msgCount), 5)} ${P(r.email, 42)} ${r.reason}`)
  }

  const lotA = rows.filter(r => r.lot === 'A')
  const lotB = rows.filter(r => r.lot === 'B')
  const suppr = rows.filter(r => r.lot === 'SUPPR')

  console.log('\n── SYNTHÈSE ────────────────────────────────────────────')
  console.log(`Lot A  (migrer)                  : ${lotA.length} demandes`)
  console.log(`Lot B  (→ rejected_emails)       : ${lotB.length} demandes`)
  console.log(`SUPPR  (suppression directe)     : ${suppr.length} demandes`)
  console.log(`Doublons (traités séparément)    : ${DUPLICATES_CMO9ZKT.length}`)
  console.log(`TOTAL                            : ${demandes.length + DUPLICATES_CMO9ZKT.length}`)

  if (lotA.length) {
    console.log('\n── LOT A (à migrer vers cmoecboxx) ────────────────────')
    for (const r of lotA) console.log(`  ${r.ref} | ${r.email} | ${r.msgCount} msg(s)`)
  }

  if (lotB.length) {
    console.log('\n── LOT B (→ rejected_emails, pre_filter_legacy) ────────')
    for (const r of lotB) console.log(`  ${r.ref} | ${r.email} | ${r.msgCount} msg(s) | ${r.reason}`)
  }

  if (suppr.length) {
    console.log('\n── SUPPRESSION DIRECTE (0 messages) ───────────────────')
    for (const r of suppr) console.log(`  ${r.ref} | ${r.email}`)
  }

  await prisma.$disconnect()
})()
