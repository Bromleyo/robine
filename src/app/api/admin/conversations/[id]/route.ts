import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'
import type { TypeEvenement } from '@prisma/client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const { id } = await params

  const example = await prisma.conversationExample.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
    include: { messages: { orderBy: { sentAt: 'asc' } } },
  })

  if (!example) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(example)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json() as { action: 'approve' | 'reject'; typeEvenement?: TypeEvenement; notes?: string }

  const existing = await prisma.conversationExample.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  const updated = await prisma.conversationExample.update({
    where: { id },
    data: {
      status: body.action === 'approve' ? 'APPROVED' : 'REJECTED',
      approvedAt: body.action === 'approve' ? now : null,
      rejectedAt: body.action === 'reject' ? now : null,
      ...(body.typeEvenement !== undefined ? { typeEvenement: body.typeEvenement } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  })

  return NextResponse.json(updated)
}
