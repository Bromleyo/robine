import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.imprimante.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.imprimante.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
