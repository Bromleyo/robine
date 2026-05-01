import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function DELETE(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId

  const [printJobs, demandes] = await prisma.$transaction([
    prisma.printJob.deleteMany({ where: { restaurantId } }),
    prisma.demande.deleteMany({ where: { restaurantId } }),
  ])

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurantId },
      data: { referenceSeq: 0 },
    }),
    prisma.contact.updateMany({
      where: { restaurantId },
      data: { nbDemandesTotal: 0, nbDemandesConfirmees: 0 },
    }),
  ])

  return NextResponse.json({
    ok: true,
    deleted: { demandes: demandes.count, printJobs: printJobs.count },
  })
}
