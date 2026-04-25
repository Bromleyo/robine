import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { searchParams } = req.nextUrl
  const reason = searchParams.get('reason')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50
  const skip = (page - 1) * limit

  const where = {
    restaurantId,
    ...(reason ? { rejectReason: reason } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.rejectedEmail.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, fromEmail: true, fromName: true, subject: true,
        rejectReason: true, details: true, bodySnippet: true,
        receivedAt: true, createdAt: true,
        mailbox: { select: { email: true } },
      },
    }),
    prisma.rejectedEmail.count({ where }),
  ])

  return NextResponse.json({ items, total, page, limit })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const { count } = await prisma.rejectedEmail.deleteMany({
    where: { restaurantId, createdAt: { lte: cutoff } },
  })

  return NextResponse.json({ deleted: count })
}
