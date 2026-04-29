import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { attachUserToMatchingRestaurant, extractEmailDomain } from '@/lib/onboarding'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    const userEmail = session?.user?.email
    if (!userId || !userEmail) {
      return NextResponse.json({ error: 'Unauthorized – no session user id' }, { status: 401 })
    }

    const existing = await prisma.membership.findFirst({ where: { userId } })
    if (existing) {
      return NextResponse.json({ error: 'Already configured' }, { status: 409 })
    }

    // SSO domain auto-attach : si le domaine de l'email matche un restaurant existant,
    // on attache l'utilisateur en RESPONSABLE sans demander le formulaire.
    const attached = await attachUserToMatchingRestaurant({ userId, email: userEmail })
    if (attached) {
      return NextResponse.json({
        ok: true,
        restaurantId: attached.restaurant.id,
        attached: true,
      })
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

    const userDomain = extractEmailDomain(userEmail)
    const allowedDomains = userDomain ? [userDomain] : []

    const { restaurant } = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: { nom, slug: `${slug}-${Date.now()}`, emailGroupes, allowedDomains },
      })
      await tx.membership.create({
        data: { userId, restaurantId: restaurant.id, role: 'ADMIN' },
      })
      const credits = await tx.aICredits.create({
        data: { restaurantId: restaurant.id, balance: 1 },
      })
      await tx.aICreditTransaction.create({
        data: {
          restaurantId: restaurant.id,
          creditsId: credits.id,
          type: 'GIFT',
          amount: 1,
          description: 'Crédit de bienvenue',
        },
      })
      return { restaurant }
    })

    return NextResponse.json({ ok: true, restaurantId: restaurant.id })
  } catch (err) {
    console.error('[onboarding]', err)
    return NextResponse.json({ error: 'Une erreur interne est survenue' }, { status: 500 })
  }
}
