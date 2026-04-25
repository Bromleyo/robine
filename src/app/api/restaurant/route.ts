import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { id: true, nom: true, adresse: true, emailGroupes: true, timezone: true },
  })
  return NextResponse.json(restaurant)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const body = await req.json() as { nom?: string; adresse?: string; emailGroupes?: string; timezone?: string }
  const data: Record<string, unknown> = {}
  if (body.nom !== undefined) data.nom = String(body.nom).trim()
  if (body.adresse !== undefined) data.adresse = body.adresse ? String(body.adresse).trim() : null
  if (body.emailGroupes !== undefined) data.emailGroupes = String(body.emailGroupes).trim()
  if (body.timezone !== undefined) data.timezone = String(body.timezone).trim()

  await prisma.restaurant.update({ where: { id: session.user.restaurantId }, data })
  return NextResponse.json({ ok: true })
}
