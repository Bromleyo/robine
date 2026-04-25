import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const espaces = await prisma.espace.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
  })
  return NextResponse.json(espaces)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const body = await req.json() as { nom?: string; capaciteMax?: number; capaciteMin?: number; description?: string }
  if (!body.nom || !body.capaciteMax) return NextResponse.json({ error: 'nom et capaciteMax requis' }, { status: 400 })

  const espace = await prisma.espace.create({
    data: {
      restaurantId: session.user.restaurantId,
      nom: body.nom.trim(),
      capaciteMax: Number(body.capaciteMax),
      capaciteMin: Number(body.capaciteMin ?? 1),
      description: body.description?.trim() || null,
    },
  })
  return NextResponse.json(espace, { status: 201 })
}
