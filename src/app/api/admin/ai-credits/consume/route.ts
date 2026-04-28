import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function POST() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const credits = await tx.aICredits.findUnique({ where: { restaurantId } })
      if (!credits || credits.balance < 1) {
        throw new Error('INSUFFICIENT_CREDITS')
      }
      const result = await tx.aICredits.update({
        where: { restaurantId },
        data: { balance: { decrement: 1 } },
      })
      await tx.aICreditTransaction.create({
        data: {
          restaurantId,
          creditsId: credits.id,
          type: 'CONSUME',
          amount: -1,
          description: 'Analyse IA',
        },
      })
      return result
    })
    return NextResponse.json({ balance: updated.balance })
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json({ error: 'Crédits insuffisants' }, { status: 402 })
    }
    throw err
  }
}
