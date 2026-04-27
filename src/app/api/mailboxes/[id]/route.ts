import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id } = await params
  const body = await req.json() as { actif?: boolean }

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { id, restaurantId },
    select: { id: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'Boîte introuvable' }, { status: 404 })

  const updated = await prisma.outlookMailbox.update({
    where: { id },
    data: {
      ...(body.actif !== undefined && { actif: body.actif }),
    },
    select: { id: true, email: true, actif: true },
  })

  return NextResponse.json(updated)
}
