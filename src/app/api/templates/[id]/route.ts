import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  const data: Record<string, unknown> = {}
  if (body.nom !== undefined) data.nom = String(body.nom).trim()
  if (body.objectif !== undefined) data.objectif = body.objectif
  if (body.subjectTemplate !== undefined) data.subjectTemplate = String(body.subjectTemplate).trim()
  if (body.bodyTemplate !== undefined) data.bodyTemplate = String(body.bodyTemplate).trim()
  if (body.actif !== undefined) data.actif = Boolean(body.actif)

  const result = await prisma.templateMessage.updateMany({
    where: { id, restaurantId: session.user.restaurantId },
    data,
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const { id } = await params
  const result = await prisma.templateMessage.deleteMany({
    where: { id, restaurantId: session.user.restaurantId },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
