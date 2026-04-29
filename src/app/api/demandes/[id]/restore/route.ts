import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

/**
 * Restaure une demande archivée ou soft-deletée.
 * Body: { from?: 'archive' | 'trash' } — si omis, déduit du state actuel.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const restaurantId = session?.user?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forbidden = requireRole(session?.user?.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { from?: 'archive' | 'trash' }

  // Bypass de l'extension soft-delete : on filtre explicitement sur deletedAt
  // pour pouvoir charger une demande supprimée ou archivée.
  const demande = await prisma.demande.findFirst({
    where: { id, restaurantId, deletedAt: { not: undefined } },
    select: { id: true, archivedAt: true, deletedAt: true },
  })
  if (!demande) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const from = body.from
    ?? (demande.deletedAt ? 'trash' : (demande.archivedAt ? 'archive' : null))

  if (!from) {
    return NextResponse.json({ error: 'Demande non archivée ni supprimée' }, { status: 400 })
  }

  const data: { deletedAt?: null; archivedAt?: null; archivedReason?: null } = {}
  if (from === 'trash') data.deletedAt = null
  if (from === 'archive') {
    data.archivedAt = null
    data.archivedReason = null
  }

  const result = await prisma.demande.updateMany({
    where: { id, restaurantId },
    data,
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ restored: true, from })
}
