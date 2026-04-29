import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { fetchDemandeDetail } from '@/lib/db/demandes'
import { PatchDemandeSchema } from '@/lib/validation/schemas'
import { notifyRestaurant } from '@/lib/db/notifications'
import { requireRole } from '@/lib/auth/require-role'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const restaurantId = session.user.restaurantId

  const [demande, menus, templates] = await Promise.all([
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
  ])

  if (!demande) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ demande, menus, templates })
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

  if (newStatut !== undefined) {
    const current = await prisma.demande.findFirst({
      where: { id, restaurantId },
      select: { statut: true, contactId: true, budgetIndicatifCents: true, reference: true },
    })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.$transaction(async (tx) => {
      await tx.demande.update({ where: { id, restaurantId }, data })

      const wasConfirmed = current.statut === 'CONFIRMEE'
      const isConfirmed = newStatut === 'CONFIRMEE'

      if (isConfirmed && !wasConfirmed) {
        await tx.contact.update({
          where: { id: current.contactId },
          data: {
            nbDemandesConfirmees: { increment: 1 },
            caTotalEstimeCents: { increment: current.budgetIndicatifCents ?? 0 },
          },
        })
      } else if (wasConfirmed && !isConfirmed) {
        await tx.contact.update({
          where: { id: current.contactId },
          data: {
            nbDemandesConfirmees: { decrement: 1 },
            caTotalEstimeCents: { decrement: current.budgetIndicatifCents ?? 0 },
          },
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
