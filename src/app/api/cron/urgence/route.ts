import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  calculerUrgenceDemande,
  isUnread,
  readDelaiAttenteClientJours,
} from '@/lib/business/urgence'
import { verifyCronRequest } from '@/lib/cron-auth'
import { logger } from '@/lib/logger'

const MS_PER_DAY = 1000 * 60 * 60 * 24

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const now = new Date()

  // Précharge la config par restaurant pour éviter le N+1 dans la boucle R2.
  const regles = await prisma.regleIA.findMany({ select: { restaurantId: true, config: true } })
  const delaiByRestaurant = new Map<string, number>()
  for (const r of regles) {
    delaiByRestaurant.set(r.restaurantId, readDelaiAttenteClientJours(r.config))
  }
  const getDelai = (restaurantId: string) =>
    delaiByRestaurant.get(restaurantId) ?? readDelaiAttenteClientJours(null)

  let demandes = await prisma.demande.findMany({
    where: { statut: { in: ['NOUVELLE', 'EN_COURS', 'ATTENTE_CLIENT'] } },
    select: {
      id: true,
      restaurantId: true,
      statut: true,
      dateEvenement: true,
      lastMessageAt: true,
      lastMessageDirection: true,
      lastSeenByAssigneeAt: true,
    },
  })

  // PR2 — R2 : EN_COURS → ATTENTE_CLIENT après N jours sans réponse client.
  // Idempotent par construction (ne touche que EN_COURS qualifiées).
  const transitions: Array<{ id: string; restaurantId: string; delaiJours: number; ageJours: number }> = []
  for (const d of demandes) {
    if (d.statut !== 'EN_COURS') continue
    if (d.lastMessageDirection !== 'OUT' || !d.lastMessageAt) continue
    const ageJours = (now.getTime() - d.lastMessageAt.getTime()) / MS_PER_DAY
    const delaiJours = getDelai(d.restaurantId)
    if (ageJours >= delaiJours) {
      transitions.push({ id: d.id, restaurantId: d.restaurantId, delaiJours, ageJours })
    }
  }

  if (transitions.length > 0) {
    await prisma.demande.updateMany({
      where: { id: { in: transitions.map(t => t.id) } },
      data: { statut: 'ATTENTE_CLIENT' },
    })
    for (const t of transitions) {
      logger.info({
        demandeId: t.id,
        restaurantId: t.restaurantId,
        from: 'EN_COURS',
        to: 'ATTENTE_CLIENT',
        reason: 'no_in_after_n_days',
        delaiJours: t.delaiJours,
        ageJours: Math.round(t.ageJours * 10) / 10,
        transition: 'R2',
      }, '[demande] auto status transition R2')
    }
    // Met à jour le snapshot local pour le recalcul d'urgence ci-dessous.
    const idsTransited = new Set(transitions.map(t => t.id))
    demandes = demandes.map(d => idsTransited.has(d.id) ? { ...d, statut: 'ATTENTE_CLIENT' as const } : d)
  }

  // Recalcul urgenceScore (passe hasUnread désormais).
  await Promise.all(
    demandes.map(d => {
      const urgence = calculerUrgenceDemande({
        statut: d.statut,
        dateEvenement: d.dateEvenement,
        now,
        lastMessageAt: d.lastMessageAt,
        lastMessageDirection: d.lastMessageDirection,
        hasUnread: isUnread(d),
      })
      return prisma.demande.update({
        where: { id: d.id },
        data: { urgenceScore: urgence.score, urgenceUpdatedAt: now },
      })
    }),
  )

  return NextResponse.json({
    ok: true,
    updated: demandes.length,
    transitions: transitions.length,
    at: now.toISOString(),
  })
}
