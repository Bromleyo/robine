import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const menus = await prisma.menu.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
  })
  return NextResponse.json(menus)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const body = await req.json() as { nom?: string; prixCents?: number; description?: string; minConvives?: number; maxConvives?: number }
  if (!body.nom || !body.prixCents) return NextResponse.json({ error: 'nom et prixCents requis' }, { status: 400 })

  const menu = await prisma.menu.create({
    data: {
      restaurantId: session.user.restaurantId,
      nom: body.nom.trim(),
      prixCents: Number(body.prixCents),
      description: body.description?.trim() || null,
      minConvives: body.minConvives ? Number(body.minConvives) : null,
      maxConvives: body.maxConvives ? Number(body.maxConvives) : null,
    },
  })
  return NextResponse.json(menu, { status: 201 })
}
