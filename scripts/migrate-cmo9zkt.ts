/**
 * ÉTAPE 2 — Migration des données cmo9zkt → cmoecboxx
 *
 * Lot A (20) : migrer vers cmoecboxx, renuméroter, legacyReference
 * Lot B (14) : logguer en rejected_emails + supprimer
 * SUPPR (1)  : supprimer directement
 * Doublons (2): DR-0023/DR-0024 → consolider messages dans cmoecboxx, supprimer versions ghost
 *
 * Usage :
 *   npx tsx scripts/migrate-cmo9zkt.ts           → dry-run (plan seulement)
 *   npx tsx scripts/migrate-cmo9zkt.ts --execute  → exécution réelle en transaction
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

const DRY_RUN = !process.argv.includes('--execute')

const GHOST_ID     = 'cmo9zkt1300014awax5p8izzb'
const SURVIVANT_ID = 'cmoecboxx000104jls85sji8n'

// Doublons connus : ref cmo9zkt → ref cmoecboxx
const DOUBLON_MAP: Record<string, string> = {
  'DR-0023': 'DR-0025',
  'DR-0024': 'DR-0029',
}

// ── Classification identique à triage-cmo9zkt.ts ─────────────────────────────
const LOT_B_PATTERNS: RegExp[] = [
  /noreply/i, /no-reply/i, /ne-pas-repondre/i,
  /^notifications@/i, /^campaigns@/i, /^bonjour@e\./i,
  /make-events/i, /^webmaster-/i,
  /^shop@mail\./i,
  /@n\.[a-z0-9-]+\.[a-z]{2,}$/i,
]
const LOT_B_WILDCARD_DOMAINS = ['bizay.com']
const LOT_B_EMAILS = ['jimmy.dubreuil@gmail.com', 'cachaca.rio@gmail.com']
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
  'acms.asso.fr', 'paypal.fr', 'paypal.com', 'ledelas.fr',
]

type Lot = 'A' | 'B' | 'SUPPR'
function classify(email: string, msgCount: number): { lot: Lot; reason: string } {
  if (msgCount === 0) return { lot: 'SUPPR', reason: '0 messages' }
  const lower = email.toLowerCase()
  const domain = lower.split('@')[1] ?? ''
  if (LOT_B_EMAILS.includes(lower)) return { lot: 'B', reason: 'blacklist' }
  if (LOT_B_PATTERNS.some(p => p.test(lower))) return { lot: 'B', reason: 'noreply_pattern' }
  if (LOT_B_WILDCARD_DOMAINS.some(d => domain.endsWith(d))) return { lot: 'B', reason: 'spam_domain' }
  if (LOT_B_PROSPECTION_DOMAINS.includes(domain)) return { lot: 'B', reason: 'prospection_domain' }
  return { lot: 'A', reason: 'demande humaine' }
}

function padRef(n: number) { return `DR-${String(n).padStart(4, '0')}` }

// ── Main ──────────────────────────────────────────────────────────────────────
void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  console.log(DRY_RUN
    ? '⚠️  DRY-RUN — affiche le plan, aucune modification DB\n'
    : '🚀 EXÉCUTION RÉELLE en transaction\n'
  )

  // ── Pre-flight ─────────────────────────────────────────────────────────────
  const [ghost, survivant] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: GHOST_ID }, select: { id: true, slug: true, referenceSeq: true } }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: SURVIVANT_ID }, select: { id: true, slug: true, referenceSeq: true } }),
  ])
  console.log(`Ghost     : ${ghost.slug} (seq=${ghost.referenceSeq})`)
  console.log(`Survivant : ${survivant.slug} (seq=${survivant.referenceSeq})`)

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { restaurantId: SURVIVANT_ID },
    select: { id: true, email: true },
  })
  if (!mailbox) {
    const ghostMbxs = await prisma.outlookMailbox.findMany({
      where: { restaurantId: GHOST_ID },
      select: { email: true },
    })
    console.error('\n❌ Aucune mailbox pour le restaurant survivant — impossible de créer rejected_emails')
    console.error('   Les rejected_emails doivent être liées à une mailbox du survivant (sinon elles')
    console.error('   seraient supprimées en cascade lors de la suppression du ghost en ÉTAPE 3).')
    if (ghostMbxs.length)
      console.error(`   Mailbox(es) ghost disponibles : ${ghostMbxs.map(m => m.email).join(', ')}`)
    process.exit(1)
  }
  console.log(`Mailbox   : ${mailbox.email} (${mailbox.id})\n`)

  // ── Classifier demandes ghost (hors doublons) ──────────────────────────────
  const demandes = await prisma.demande.findMany({
    where: { restaurantId: GHOST_ID, reference: { notIn: Object.keys(DOUBLON_MAP) } },
    select: {
      id: true, reference: true, createdAt: true,
      contact: { select: { id: true, email: true, nom: true } },
      threads: {
        select: {
          id: true, messageIdRoot: true,
          messages: {
            select: {
              id: true, microsoftGraphId: true,
              receivedAt: true, sentAt: true, subject: true, bodyText: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
    orderBy: { reference: 'asc' },
  })

  const classified = demandes.map(d => {
    const allMsgs = d.threads.flatMap(t => t.messages)
    const { lot, reason } = classify(d.contact?.email ?? '', allMsgs.length)
    return { ...d, lot, reason, allMsgs }
  })

  const lotA = classified.filter(d => d.lot === 'A')
  const lotB = classified.filter(d => d.lot === 'B')
  const suppr = classified.filter(d => d.lot === 'SUPPR')

  console.log('── Classement ──────────────────────────────────────────────────')
  console.log(`Lot A  (migrer)    : ${lotA.length}`)
  console.log(`Lot B  (→ rejected): ${lotB.length}`)
  console.log(`SUPPR  (delete)    : ${suppr.length}`)
  console.log(`Doublons           : ${Object.keys(DOUBLON_MAP).length}`)

  if (lotA.length !== 20 || lotB.length !== 14 || suppr.length !== 1) {
    console.error(`\n❌ Counts inattendus (attendu A=20 B=14 SUPPR=1). Migration annulée.`)
    console.error(`   Obtenu A=${lotA.length} B=${lotB.length} SUPPR=${suppr.length}`)
    process.exit(1)
  }
  console.log('✓ Counts validés\n')

  // ── Résoudre contacts Lot A ───────────────────────────────────────────────
  // Vérifier si un contact cmoecboxx avec le même email existe déjà
  const contactRemap = new Map<string, string>() // cmo9zkt contactId → contactId cible
  for (const d of lotA) {
    if (!d.contact || contactRemap.has(d.contact.id)) continue
    const existing = await prisma.contact.findUnique({
      where: { restaurantId_email: { restaurantId: SURVIVANT_ID, email: d.contact.email } },
      select: { id: true },
    })
    contactRemap.set(d.contact.id, existing?.id ?? d.contact.id)
    // Si existing: réutiliser le contact cmoecboxx (contactId change sur la demande)
    // Sinon: même ID, le contact sera déplacé via update restaurantId
  }

  // ── Plan Lot A ────────────────────────────────────────────────────────────
  const seqStart = survivant.referenceSeq + 1
  const lotAPlanned = lotA.map((d, i) => ({ ...d, newRef: padRef(seqStart + i), newSeq: seqStart + i }))
  const finalSeq = seqStart + lotA.length - 1

  console.log('── Lot A (migrer) ───────────────────────────────────────────────')
  for (const d of lotAPlanned) {
    const target = contactRemap.get(d.contact!.id)
    const note = target !== d.contact!.id ? ` [contact→existing ${target?.slice(-6)}]` : ''
    console.log(`  ${d.reference} → ${d.newRef} | ${d.contact?.email}${note}`)
  }
  console.log(`  referenceSeq : ${survivant.referenceSeq} → ${finalSeq}\n`)

  console.log('── Lot B (→ rejected_emails + delete) ───────────────────────────')
  for (const d of lotB)
    console.log(`  ${d.reference} | ${d.contact?.email} | ${d.reason}`)

  console.log('\n── SUPPR (delete direct) ────────────────────────────────────────')
  for (const d of suppr)
    console.log(`  ${d.reference} | ${d.contact?.email}`)

  console.log('\n── Doublons (delete version ghost) ──────────────────────────────')
  for (const [gr, sr] of Object.entries(DOUBLON_MAP))
    console.log(`  ${gr} ghost → consolider dans ${sr} survivant`)

  if (DRY_RUN) {
    console.log('\n── DRY-RUN terminé. Relancer avec --execute pour appliquer.\n')
    await prisma.$disconnect()
    return
  }

  // ── TRANSACTION ────────────────────────────────────────────────────────────
  console.log('\n── Démarrage transaction ────────────────────────────────────────')

  const stats = await prisma.$transaction(async (tx) => {
    let migratedA = 0, rejectedB = 0, deletedSuppr = 0, deletedDoublons = 0
    const movedContactIds = new Set<string>()

    // 1. Lot A — migrer ───────────────────────────────────────────────────────
    for (const d of lotAPlanned) {
      const targetContactId = contactRemap.get(d.contact!.id)!
      const moveContact = targetContactId === d.contact!.id && !movedContactIds.has(d.contact!.id)

      if (moveContact) {
        await tx.contact.update({ where: { id: d.contact!.id }, data: { restaurantId: SURVIVANT_ID } })
        movedContactIds.add(d.contact!.id)
      }

      await tx.demande.update({
        where: { id: d.id },
        data: {
          restaurantId: SURVIVANT_ID,
          reference: d.newRef,
          legacyReference: d.reference,
          contactId: targetContactId,
          espaceId: null,          // espaces scopés à cmo9zkt — à réassigner manuellement si besoin
          menuSelectionneId: null, // idem
        },
      })
      await tx.pieceJointe.updateMany({ where: { demandeId: d.id }, data: { restaurantId: SURVIVANT_ID } })
      await tx.notification.updateMany({ where: { demandeId: d.id }, data: { restaurantId: SURVIVANT_ID } })

      console.log(`  A ✓ ${d.reference} → ${d.newRef}`)
      migratedA++
    }

    await tx.restaurant.update({ where: { id: SURVIVANT_ID }, data: { referenceSeq: finalSeq } })
    console.log(`  referenceSeq cmoecboxx → ${finalSeq}`)

    // 2. Lot B — logguer + supprimer ─────────────────────────────────────────
    for (const d of lotB) {
      const firstMsg = d.allMsgs[0]
      const receivedAt = firstMsg?.receivedAt ?? firstMsg?.sentAt ?? d.createdAt

      await tx.rejectedEmail.create({
        data: {
          restaurantId: SURVIVANT_ID,
          mailboxId: mailbox.id,
          microsoftGraphId: `pre_filter_legacy_${d.id}`,
          fromEmail: d.contact?.email ?? 'unknown@unknown',
          fromName: d.contact?.nom ?? null,
          subject: firstMsg?.subject ?? null,
          rejectReason: 'pre_filter_legacy',
          details: `${d.reference} — ${d.reason}`,
          bodySnippet: firstMsg?.bodyText?.slice(0, 500) ?? null,
          receivedAt,
        },
      })
      await tx.demande.delete({ where: { id: d.id } })

      console.log(`  B ✓ ${d.reference} loggué + supprimé (${d.contact?.email})`)
      rejectedB++
    }

    // 3. SUPPR — supprimer directement ────────────────────────────────────────
    for (const d of suppr) {
      await tx.demande.delete({ where: { id: d.id } })
      console.log(`  S ✓ ${d.reference} supprimé (${d.contact?.email})`)
      deletedSuppr++
    }

    // 4. Doublons — consolider threads puis supprimer version ghost ────────────
    for (const [ghostRef, survivantRef] of Object.entries(DOUBLON_MAP)) {
      const ghostD = await tx.demande.findFirst({
        where: { restaurantId: GHOST_ID, reference: ghostRef },
        select: { id: true, threads: { select: { id: true, messageIdRoot: true } } },
      })
      if (!ghostD) { console.log(`  D ⚠️  ${ghostRef} introuvable — déjà supprimé ?`); continue }

      const survivantD = await tx.demande.findFirst({
        where: { restaurantId: SURVIVANT_ID, reference: survivantRef },
        select: { id: true, threads: { select: { id: true, messageIdRoot: true } } },
      })
      if (!survivantD) {
        console.log(`  D ⚠️  ${survivantRef} introuvable dans survivant — skip`)
        continue
      }

      // Déplacer les threads ghost absents du survivant (par messageIdRoot)
      const survivantRoots = new Set(survivantD.threads.map(t => t.messageIdRoot))
      const orphanThreads = ghostD.threads.filter(t => !survivantRoots.has(t.messageIdRoot))
      for (const t of orphanThreads) {
        await tx.thread.update({ where: { id: t.id }, data: { demandeId: survivantD.id } })
        console.log(`  D   thread ${t.id.slice(-6)} consolidé dans ${survivantRef}`)
      }

      await tx.demande.delete({ where: { id: ghostD.id } })
      console.log(`  D ✓ ${ghostRef} supprimé (→ ${survivantRef})`)
      deletedDoublons++
    }

    return { migratedA, rejectedB, deletedSuppr, deletedDoublons }
  }, { timeout: 60_000 })

  // ── Résumé + Vérifications ─────────────────────────────────────────────────
  console.log('\n── Résumé ───────────────────────────────────────────────────────')
  console.log(`Lot A migrés        : ${stats.migratedA}`)
  console.log(`Lot B loggués+del   : ${stats.rejectedB}`)
  console.log(`SUPPR supprimés     : ${stats.deletedSuppr}`)
  console.log(`Doublons supprimés  : ${stats.deletedDoublons}`)

  console.log('\n── Vérifications post-migration ─────────────────────────────────')
  const [ghostCnt, survivantCnt, legacyCnt, rejectedCnt, updatedR] = await Promise.all([
    prisma.demande.count({ where: { restaurantId: GHOST_ID } }),
    prisma.demande.count({ where: { restaurantId: SURVIVANT_ID } }),
    prisma.demande.count({ where: { restaurantId: SURVIVANT_ID, legacyReference: { not: null } } }),
    prisma.rejectedEmail.count({ where: { restaurantId: SURVIVANT_ID, rejectReason: 'pre_filter_legacy' } }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: SURVIVANT_ID }, select: { referenceSeq: true } }),
  ])

  const EXPECTED_SURVIVANT = 23 + 20 - 2 // 41
  const chk = (got: number, exp: number) => `${got} / ${exp} ${got === exp ? '✓' : '❌'}`

  console.log(`cmo9zkt demandes     : ${chk(ghostCnt, 0)}`)
  console.log(`cmoecboxx demandes   : ${chk(survivantCnt, EXPECTED_SURVIVANT)}`)
  console.log(`Lot A legacyRef      : ${chk(legacyCnt, 20)}`)
  console.log(`rejected pre_filter  : ${chk(rejectedCnt, 14)}`)
  console.log(`referenceSeq         : ${chk(updatedR.referenceSeq, finalSeq)}`)

  await prisma.$disconnect()
})()
