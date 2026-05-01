import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { nextReferenceSeq } from '@/lib/db/demandes'
import { CreateDemandeSchema } from '@/lib/validation/schemas'
import { notifyRestaurant } from '@/lib/db/notifications'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const raw = await req.json()
  const parsed = CreateDemandeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const contact = await prisma.contact.upsert({
    where: { restaurantId_email: { restaurantId, email: body.contactEmail } },
    update: {
      nom: body.contactNom,
      ...(body.contactSociete ? { societe: body.contactSociete } : {}),
      ...(body.contactTelephone ? { telephone: body.contactTelephone } : {}),
    },
    create: {
      restaurantId,
      email: body.contactEmail,
      nom: body.contactNom,
      societe: body.contactSociete ?? null,
      telephone: body.contactTelephone ?? null,
    },
  })

  const reference = await nextReferenceSeq(restaurantId)

  const demande = await prisma.demande.create({
    data: {
      restaurantId,
      reference,
      contactId: contact.id,
      origine: 'TELEPHONE',
      statut: 'NOUVELLE',
      typeEvenement: body.typeEvenement ?? null,
      dateEvenement: body.dateEvenement ? new Date(body.dateEvenement) : null,
      heureDebut: body.heureDebut ?? null,
      heureFin: body.heureFin ?? null,
      nbInvites: body.nbInvites ?? null,
      espaceId: body.espaceId ?? null,
      notes: body.notes ?? null,
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
    excludeUserId: session.user.id ?? undefined,
  })

  return NextResponse.json({ id: demande.id, reference })
}
