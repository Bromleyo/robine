import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized – no session user id' }, { status: 401 })
    }

    const existing = await prisma.membership.findFirst({ where: { userId } })
    if (existing) {
      return NextResponse.json({ error: 'Already configured' }, { status: 409 })
    }

    const body = await req.json().catch(() => ({})) as { nom?: string; emailGroupes?: string }
    const nom = body.nom?.trim()
    const emailGroupes = body.emailGroupes?.trim()

    if (!nom || !emailGroupes) {
      return NextResponse.json({ error: 'nom et emailGroupes requis' }, { status: 400 })
    }

    const slug = nom
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const { restaurant } = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: { nom, slug: `${slug}-${Date.now()}`, emailGroupes },
      })
      await tx.membership.create({
        data: { userId, restaurantId: restaurant.id, role: 'ADMIN' },
      })
      return { restaurant }
    })

    return NextResponse.json({ ok: true, restaurantId: restaurant.id })
  } catch (err) {
    console.error('[onboarding]', err)
    return NextResponse.json({ error: 'Une erreur interne est survenue' }, { status: 500 })
  }
}
