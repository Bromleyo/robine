import { prisma } from '@/lib/db/prisma'

export interface ConflitResult {
  hasConflict: boolean
  conflictingDemandeIds: string[]
}

export async function detecterConflits(
  restaurantId: string,
  demandeId: string,
): Promise<ConflitResult> {
  const demande = await prisma.demande.findUnique({
    where: { id: demandeId },
    select: { espaceId: true, dateEvenement: true, statut: true },
  })

  if (!demande?.espaceId || !demande.dateEvenement) {
    return { hasConflict: false, conflictingDemandeIds: [] }
  }

  if (demande.statut === 'ANNULEE' || demande.statut === 'PERDUE') {
    return { hasConflict: false, conflictingDemandeIds: [] }
  }

  const dayStart = new Date(demande.dateEvenement)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(demande.dateEvenement)
  dayEnd.setHours(23, 59, 59, 999)

  const conflicts = await prisma.demande.findMany({
    where: {
      restaurantId,
      id: { not: demandeId },
      espaceId: demande.espaceId,
      dateEvenement: { gte: dayStart, lte: dayEnd },
      statut: { notIn: ['ANNULEE', 'PERDUE'] },
      conflitOverride: false,
    },
    select: { id: true },
  })

  return {
    hasConflict: conflicts.length > 0,
    conflictingDemandeIds: conflicts.map(c => c.id),
  }
}

export async function refreshConflitsForRestaurant(restaurantId: string): Promise<void> {
  const demandes = await prisma.demande.findMany({
    where: {
      restaurantId,
      statut: { notIn: ['ANNULEE', 'PERDUE', 'CONFIRMEE'] },
      espaceId: { not: null },
      dateEvenement: { not: null },
    },
    select: { id: true },
  })

  await Promise.all(
    demandes.map(async ({ id }) => {
      const { hasConflict } = await detecterConflits(restaurantId, id)
      await prisma.demande.update({ where: { id }, data: { conflitDetecte: hasConflict } })
    }),
  )
}
