import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { nextReferenceSeq } from '@/lib/db/demandes'
import { ReservationPubliqueSchema } from '@/lib/validation/schemas'
import { checkRateLimit } from '@/lib/rate-limit'
import { notifyRestaurant } from '@/lib/db/notifications'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(`reservation:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 })
  }

  const raw = await req.json()

  // Honeypot — bots fill hidden fields, humans don't
  if (raw._hp) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const parsed = ReservationPubliqueSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: body.restaurantId },
    select: { id: true },
  })
  if (!restaurant) return NextResponse.json({ error: 'Restaurant introuvable' }, { status: 404 })

  const restaurantId = restaurant.id

  const contact = await prisma.contact.upsert({
    where: { restaurantId_email: { restaurantId, email: body.contactEmail } },
    update: {
      nom: body.contactNom,
      ...(body.contactTelephone ? { telephone: body.contactTelephone } : {}),
    },
    create: {
      restaurantId,
      email: body.contactEmail,
      nom: body.contactNom,
      telephone: body.contactTelephone ?? null,
    },
  })

  const reference = await nextReferenceSeq(restaurantId)

  const demande = await prisma.demande.create({
    data: {
      restaurantId,
      reference,
      contactId: contact.id,
      origine: 'FORMULAIRE',
      statut: 'NOUVELLE',
      typeEvenement: body.typeEvenement ?? null,
      dateEvenement: body.dateEvenement ? new Date(body.dateEvenement) : null,
      nbInvites: body.nbInvites ?? null,
      budgetIndicatifCents: body.budgetEuros ? Math.round(body.budgetEuros * 100) : null,
      notes: body.message,
      urgenceScore: 0,
      conflitDetecte: false,
      contraintesAlimentaires: [],
    },
  })

  await prisma.contact.update({
    where: { id: contact.id },
    data: { nbDemandesTotal: { increment: 1 } },
  })

  void notifyRestaurant({
    restaurantId,
    type: 'NOUVELLE_DEMANDE',
    titre: `Nouvelle demande — ${reference}`,
    body: `${body.contactNom} · ${body.typeEvenement ?? 'Événement'}`,
    demandeId: demande.id,
  })

  return NextResponse.json({ id: demande.id, reference }, { status: 201 })
}
