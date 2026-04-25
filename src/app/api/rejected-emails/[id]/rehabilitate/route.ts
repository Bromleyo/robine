import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { nextReferenceSeq } from '@/lib/db/demandes'
import { calculerUrgenceDemande } from '@/lib/business/urgence'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id } = await params
  const rejected = await prisma.rejectedEmail.findFirst({
    where: { id, restaurantId },
    select: { id: true, fromEmail: true, fromName: true, subject: true, bodySnippet: true, receivedAt: true },
  })
  if (!rejected) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const contact = await prisma.contact.upsert({
    where: { restaurantId_email: { restaurantId, email: rejected.fromEmail } },
    update: { nom: rejected.fromName ?? rejected.fromEmail },
    create: { restaurantId, email: rejected.fromEmail, nom: rejected.fromName ?? rejected.fromEmail },
  })

  const reference = await nextReferenceSeq(restaurantId)
  const urgence = calculerUrgenceDemande({
    statut: 'NOUVELLE',
    dateEvenement: null,
    now: new Date(),
    lastMessageAt: rejected.receivedAt,
    lastMessageDirection: 'IN',
  })

  const demande = await prisma.demande.create({
    data: {
      restaurantId,
      reference,
      contactId: contact.id,
      statut: 'NOUVELLE',
      origine: 'EMAIL',
      notes: rejected.bodySnippet
        ? `[Réhabilité depuis filtre]\n\n${rejected.bodySnippet}`
        : '[Réhabilité depuis filtre]',
      urgenceScore: urgence.score,
      lastMessageAt: rejected.receivedAt,
      lastMessageDirection: 'IN',
    },
  })

  await prisma.contact.update({
    where: { id: contact.id },
    data: { nbDemandesTotal: { increment: 1 } },
  })

  await prisma.rejectedEmail.delete({ where: { id: rejected.id } })

  return NextResponse.json({ demandeId: demande.id, reference })
}
