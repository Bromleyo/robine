import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_ENABLED) {
    return NextResponse.json({ error: 'Achat de crédits temporairement indisponible' }, { status: 403 })
  }

  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId
  const body = await req.json() as { quantity?: number }
  const quantity = Math.min(Math.max(1, body.quantity ?? 1), 10)

  const credits = await prisma.aICredits.upsert({
    where: { restaurantId },
    update: { balance: { increment: quantity } },
    create: { restaurantId, balance: quantity },
  })

  await prisma.aICreditTransaction.create({
    data: {
      restaurantId,
      creditsId: credits.id,
      type: 'PURCHASE',
      amount: quantity,
      description: `Achat de ${quantity} crédit${quantity > 1 ? 's' : ''}`,
    },
  })

  return NextResponse.json({ balance: credits.balance })
}
