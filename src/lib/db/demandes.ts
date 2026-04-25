import { prisma } from '@/lib/db/prisma'
import { calculerUrgenceDemande } from '@/lib/business/urgence'
import type { DemandeEnriched } from '@/types/domain'

export async function fetchDemandesKanban(restaurantId: string): Promise<DemandeEnriched[]> {
  const rows = await prisma.demande.findMany({
    where: {
      restaurantId,
      statut: { in: ['NOUVELLE', 'EN_COURS', 'ATTENTE_CLIENT', 'CONFIRMEE'] },
    },
    include: {
      contact: true,
      assignee: { select: { id: true, nom: true, avatarColor: true } },
      espace: { select: { id: true, restaurantId: true, nom: true, capaciteMax: true, actif: true } },
      _count: { select: { threads: true } },
    },
    orderBy: { urgenceScore: 'desc' },
  })

  const now = new Date()
  return rows.map(d => {
    const urgence = calculerUrgenceDemande({
      statut: d.statut,
      dateEvenement: d.dateEvenement,
      now,
      lastMessageAt: d.lastMessageAt,
      lastMessageDirection: d.lastMessageDirection,
    })
    return {
      id: d.id,
      restaurantId: d.restaurantId,
      reference: d.reference,
      contactId: d.contactId,
      assigneeId: d.assigneeId ?? undefined,
      espaceId: d.espaceId ?? undefined,
      statut: d.statut,
      typeEvenement: d.typeEvenement ?? undefined,
      origine: d.origine,
      dateEvenement: d.dateEvenement ?? undefined,
      heureDebut: d.heureDebut ?? undefined,
      heureFin: d.heureFin ?? undefined,
      nbInvites: d.nbInvites ?? undefined,
      budgetIndicatifCents: d.budgetIndicatifCents ?? undefined,
      contraintesAlimentaires: d.contraintesAlimentaires,
      urgenceScore: urgence.score,
      conflitDetecte: d.conflitDetecte,
      lastMessageAt: d.lastMessageAt ?? undefined,
      lastMessageDirection: d.lastMessageDirection ?? undefined,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      contact: {
        id: d.contact.id,
        restaurantId: d.contact.restaurantId,
        email: d.contact.email,
        nom: d.contact.nom,
        societe: d.contact.societe ?? undefined,
        telephone: d.contact.telephone ?? undefined,
        nbDemandesTotal: d.contact.nbDemandesTotal,
        nbDemandesConfirmees: d.contact.nbDemandesConfirmees,
      },
      assignee: d.assignee ?? undefined,
      espace: d.espace ?? undefined,
      urgenceLevel: urgence.level,
      threadCount: d._count.threads,
    }
  })
}

export type DemandeDetail = NonNullable<Awaited<ReturnType<typeof fetchDemandeDetail>>>

export async function fetchDemandeDetail(restaurantId: string, id: string) {
  return prisma.demande.findFirst({
    where: { id, restaurantId },
    include: {
      contact: true,
      assignee: { select: { id: true, nom: true, avatarColor: true } },
      espace: { select: { id: true, nom: true, capaciteMax: true } },
      pieces: { orderBy: { createdAt: 'asc' } },
      threads: {
        orderBy: { createdAt: 'asc' },
        include: {
          messages: {
            orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  })
}

export async function fetchDemandesAll(restaurantId: string) {
  return prisma.demande.findMany({
    where: { restaurantId },
    include: {
      contact: { select: { id: true, nom: true, email: true, societe: true } },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function nextReferenceSeq(restaurantId: string): Promise<string> {
  const updated = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { referenceSeq: { increment: 1 } },
    select: { referenceSeq: true },
  })
  return `DR-${String(updated.referenceSeq).padStart(4, '0')}`
}
