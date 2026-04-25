import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.regleIA.findUnique({
    where: { restaurantId: session.user.restaurantId },
    select: { config: true },
  })

  return NextResponse.json(row?.config ?? {})
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }

  await prisma.regleIA.upsert({
    where: { restaurantId: session.user.restaurantId },
    create: { restaurantId: session.user.restaurantId, config: body },
    update: { config: body },
  })

  return NextResponse.json({ ok: true })
}
