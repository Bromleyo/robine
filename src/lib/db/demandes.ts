import { prisma } from '@/lib/db/prisma'
import { calculerUrgenceDemande, isUnread } from '@/lib/business/urgence'
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
    // PR2 — tie-breaker DB-level : à score égal, l'événement le plus proche
    // d'abord, les sans-date en fin. Le tri intra-colonne du composant
    // kanban-board.tsx applique le même critère pour rester cohérent après
    // recalcul live du score (boost unread).
    orderBy: [
      { urgenceScore: 'desc' },
      { dateEvenement: { sort: 'asc', nulls: 'last' } },
    ],
  })

  const now = new Date()
  return rows.map(d => {
    const hasUnread = isUnread({
      lastMessageDirection: d.lastMessageDirection,
      lastMessageAt: d.lastMessageAt,
      lastSeenByAssigneeAt: d.lastSeenByAssigneeAt,
    })
    const urgence = calculerUrgenceDemande({
      statut: d.statut,
      dateEvenement: d.dateEvenement,
      now,
      lastMessageAt: d.lastMessageAt,
      lastMessageDirection: d.lastMessageDirection,
      hasUnread,
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
      lastSeenByAssigneeAt: d.lastSeenByAssigneeAt ?? undefined,
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
      hasUnread,
    }
  })
}

export type DemandeDetail = NonNullable<Awaited<ReturnType<typeof fetchDemandeDetail>>>

/**
 * PR3 — Tri chronologique strict d'un thread de messages.
 * effectiveDate = sentAt ?? receivedAt ?? createdAt (préserve la sémantique
 * temporelle même quand le pipeline d'ingest a re-créé un message — cf.
 * reparse-message-bodies, reingest-lost-event-emails — où createdAt diverge
 * de receivedAt). Tie-breakers : createdAt puis id (cuid lexicographique
 * stable, monotone temporel).
 *
 * ASC strict : ancien en haut, récent en bas (sens lecture chat).
 */
export interface SortableMessage {
  id: string
  sentAt: Date | null
  receivedAt: Date | null
  createdAt: Date
}

function effectiveDateMs(m: SortableMessage): number {
  return (m.sentAt ?? m.receivedAt ?? m.createdAt).getTime()
}

export function sortMessagesChronologically<T extends SortableMessage>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    const da = effectiveDateMs(a)
    const db = effectiveDateMs(b)
    if (da !== db) return da - db
    const ca = a.createdAt.getTime()
    const cb = b.createdAt.getTime()
    if (ca !== cb) return ca - cb
    return a.id.localeCompare(b.id)
  })
}

export async function fetchDemandeDetail(restaurantId: string, id: string) {
  const demande = await prisma.demande.findFirst({
    where: { id, restaurantId },
    include: {
      contact: true,
      assignee: { select: { id: true, nom: true, avatarColor: true } },
      espace: { select: { id: true, nom: true, capaciteMax: true } },
      pieces: { orderBy: { createdAt: 'asc' } },
      threads: {
        orderBy: { createdAt: 'asc' },
        include: {
          // PR3 — orderBy DB conservé comme pré-tri, mais le re-sort JS
          // ci-dessous est la source de vérité (gère sentAt/receivedAt NULL).
          messages: {
            orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  })

  if (demande) {
    for (const thread of demande.threads) {
      thread.messages = sortMessagesChronologically(thread.messages)
    }
  }

  return demande
}

export type DemandesView = 'active' | 'archived' | 'trash'

export async function fetchDemandesAll(restaurantId: string, view: DemandesView = 'active') {
  const where = (() => {
    if (view === 'trash') return { restaurantId, deletedAt: { not: null } }
    if (view === 'archived') return { restaurantId, archivedAt: { not: null }, deletedAt: null }
    return { restaurantId, archivedAt: null, deletedAt: null }
  })()

  return prisma.demande.findMany({
    where,
    include: {
      contact: { select: { id: true, nom: true, email: true, societe: true } },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function countDemandesByView(restaurantId: string) {
  const [active, archived, trash] = await Promise.all([
    prisma.demande.count({ where: { restaurantId, archivedAt: null, deletedAt: null } }),
    prisma.demande.count({ where: { restaurantId, archivedAt: { not: null }, deletedAt: null } }),
    prisma.demande.count({ where: { restaurantId, deletedAt: { not: null } } }),
  ])
  return { active, archived, trash }
}

export async function nextReferenceSeq(restaurantId: string): Promise<string> {
  const updated = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { referenceSeq: { increment: 1 } },
    select: { referenceSeq: true },
  })
  return `DR-${String(updated.referenceSeq).padStart(4, '0')}`
}
