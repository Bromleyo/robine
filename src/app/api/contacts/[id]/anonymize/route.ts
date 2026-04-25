import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id } = await params

  const contact = await prisma.contact.findFirst({
    where: { id, restaurantId },
    select: { id: true, anonymizedAt: true },
  })
  if (!contact) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  if (contact.anonymizedAt) return NextResponse.json({ error: 'Déjà anonymisé' }, { status: 409 })

  await prisma.contact.update({
    where: { id },
    data: {
      nom: 'Contact anonymisé',
      email: `anon-${id}@supprime.local`,
      telephone: null,
      societe: null,
      notes: null,
      anonymizedAt: new Date(),
    },
  })

  return new NextResponse(null, { status: 204 })
}
