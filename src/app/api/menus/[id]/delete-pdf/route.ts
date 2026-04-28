import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'
import { del } from '@vercel/blob'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const { id } = await params

  const menu = await prisma.menu.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
    select: { id: true, pdfUrl: true },
  })
  if (!menu) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (menu.pdfUrl) {
    await del(menu.pdfUrl)
  }

  await prisma.menu.update({ where: { id }, data: { pdfUrl: null } })

  return NextResponse.json({ ok: true })
}
