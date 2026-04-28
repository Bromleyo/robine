import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const credits = await prisma.aICredits.upsert({
    where: { restaurantId: session.user.restaurantId },
    update: {},
    create: { restaurantId: session.user.restaurantId, balance: 1 },
  })

  return NextResponse.json({ balance: credits.balance })
}
