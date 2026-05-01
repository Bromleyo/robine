import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { fetchDemandeDetail } from '@/lib/db/demandes'
import { PatchDemandeSchema } from '@/lib/validation/schemas'
import { notifyRestaurant } from '@/lib/db/notifications'
import { requireRole } from '@/lib/auth/require-role'
import { calculerUrgenceDemande } from '@/lib/business/urgence'
import { detecterConflits } from '@/lib/business/conflit'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const restaurantId = session.user.restaurantId

  const [demande, menus, templates, espaces] = await Promise.all([
    fetchDemandeDetail(restaurantId, id),
    prisma.menu.findMany({
      where: { restaurantId, actif: true },
      orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
    }),
    prisma.templateMessage.findMany({
      where: { restaurantId, actif: true },
      orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
      take: 4,
    }),
    prisma.espace.findMany({
      where: { restaurantId, actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, nom: true, capaciteMax: true },
    }),
  ])

  if (!demande) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ demande, menus, templates, espaces })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const raw = await req.json()
  const parsed = PatchDemandeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 })
  }

  const { dateEvenement, ...rest } = parsed.data
  const data: Record<string, unknown> = { ...rest }
  if (dateEvenement !== undefined) {
    data.dateEvenement = dateEvenement ? new Date(dateEvenement) : null
  }

  const restaurantId = session.user.restaurantId
  const newStatut = parsed.data.statut
  const newAssigneeId = parsed.data.assigneeId

  // PR6 — fields whose change invalidates the cached urgenceScore / conflitDetecte.
  const datePatched = 'dateEvenement' in parsed.data
  const espacePatched = 'espaceId' in parsed.data
  const statutPatched = newStatut !== undefined

  if (statutPatched) {
    const current = await prisma.demande.findFirst({
      where: { id, restaurantId },
      select: { statut: true, contactId: true, reference: true },
    })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.$transaction(async (tx) => {
      await tx.demande.update({ where: { id, restaurantId }, data })

      const wasConfirmed = current.statut === 'CONFIRMEE'
      const isConfirmed = newStatut === 'CONFIRMEE'

      if (isConfirmed && !wasConfirmed) {
        await tx.contact.update({
          where: { id: current.contactId },
          data: { nbDemandesConfirmees: { increment: 1 } },
        })
      } else if (wasConfirmed && !isConfirmed) {
        await tx.contact.update({
          where: { id: current.contactId },
          data: { nbDemandesConfirmees: { decrement: 1 } },
        })
      }
    })
  } else if (newAssigneeId !== undefined && newAssigneeId !== null) {
    const result = await prisma.demande.updateMany({ where: { id, restaurantId }, data })
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    void notifyRestaurant({
      restaurantId,
      type: 'DEMANDE_ASSIGNEE',
      titre: 'Demande assignée',
      demandeId: id,
      excludeUserId: session.user.id ?? undefined,
    })
  } else {
    const result = await prisma.demande.updateMany({ where: { id, restaurantId }, data })
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // PR6 — recalculs synchrones après update.
  if (datePatched || espacePatched || statutPatched) {
    const fresh = await prisma.demande.findUnique({
      where: { id },
      select: {
        statut: true, dateEvenement: true,
        lastMessageAt: true, lastMessageDirection: true,
      },
    })
    if (fresh) {
      const urgence = calculerUrgenceDemande({
        statut: fresh.statut,
        dateEvenement: fresh.dateEvenement,
        now: new Date(),
        lastMessageAt: fresh.lastMessageAt,
        lastMessageDirection: fresh.lastMessageDirection,
      })
      const updates: Record<string, unknown> = {
        urgenceScore: urgence.score,
        urgenceUpdatedAt: new Date(),
      }
      if (datePatched || espacePatched) {
        const { hasConflict } = await detecterConflits(restaurantId, id)
        updates.conflitDetecte = hasConflict
      }
      await prisma.demande.update({ where: { id }, data: updates })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const restaurantId = session?.user?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forbidden = requireRole(session?.user?.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const { id } = await params

  // L'extension Prisma soft-delete filtre deletedAt:null, donc findFirst ne renvoie
  // que les non-supprimés. Pour soft-delete on bypasse via updateMany scopé.
  const result = await prisma.demande.updateMany({
    where: { id, restaurantId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found or already deleted' }, { status: 404 })
  }
  return NextResponse.json({ deleted: true })
}
