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
  if (body.prixCents !== undefined) data.prixCents = Number(body.prixCents)
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.minConvives !== undefined) data.minConvives = body.minConvives ? Number(body.minConvives) : null
  if (body.maxConvives !== undefined) data.maxConvives = body.maxConvives ? Number(body.maxConvives) : null
  if (body.actif !== undefined) data.actif = Boolean(body.actif)

  const result = await prisma.menu.updateMany({
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
  const result = await prisma.menu.deleteMany({
    where: { id, restaurantId: session.user.restaurantId },
  })
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
