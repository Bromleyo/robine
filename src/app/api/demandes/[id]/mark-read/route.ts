import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

/**
 * PR2 — Bouton "Marquer comme traité" sur la fiche demande.
 * Met à jour Demande.lastSeenByAssigneeAt = now() pour faire disparaître
 * la pastille "nouveau message". Pas d'effet sur le statut ni sur le score.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const restaurantId = session?.user?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const result = await prisma.demande.updateMany({
    where: { id, restaurantId },
    data: { lastSeenByAssigneeAt: new Date() },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
