import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const memberships = await prisma.membership.findMany({
    where: { restaurantId: session.user.restaurantId },
    include: { user: { select: { id: true, nom: true, avatarColor: true } } },
    orderBy: { user: { nom: 'asc' } },
  })

  return NextResponse.json(
    memberships.map(m => ({ id: m.user.id, nom: m.user.nom, avatarColor: m.user.avatarColor, role: m.role })),
  )
}
