import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const CreateSchema = z.object({
  nom: z.string().min(1).max(100),
  adresseIp: z.string().max(50).optional(),
  modele: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const imprimantes = await prisma.imprimante.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(imprimantes)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as unknown
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const imprimante = await prisma.imprimante.create({
    data: { ...parsed.data, restaurantId: session.user.restaurantId },
  })

  return NextResponse.json(imprimante, { status: 201 })
}
