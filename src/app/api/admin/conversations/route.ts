import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const typeEvenement = searchParams.get('typeEvenement') ?? undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 20

  const where = {
    restaurantId,
    ...(status ? { status } : {}),
    ...(typeEvenement ? { typeEvenement: typeEvenement as never } : {}),
  }

  const [examples, total] = await Promise.all([
    prisma.conversationExample.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        subject: true,
        typeEvenement: true,
        status: true,
        contactName: true,
        contactEmail: true,
        startDate: true,
        messageCount: true,
        approvedAt: true,
        notes: true,
      },
    }),
    prisma.conversationExample.count({ where }),
  ])

  return NextResponse.json({ examples, total, page, pages: Math.ceil(total / limit) })
}
