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
  if (body.capaciteMax !== undefined) data.capaciteMax = Number(body.capaciteMax)
  if (body.capaciteMin !== undefined) data.capaciteMin = Number(body.capaciteMin)
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.actif !== undefined) data.actif = Boolean(body.actif)
  if (body.ordre !== undefined) data.ordre = Number(body.ordre)

  const result = await prisma.espace.updateMany({
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
  const result = await prisma.espace.deleteMany({
    where: { id, restaurantId: session.user.restaurantId },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
