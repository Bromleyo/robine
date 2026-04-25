import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { createMailSubscription } from '@/lib/graph/subscription'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id } = await params
  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { id, restaurantId },
    select: { id: true, email: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'Boîte introuvable' }, { status: 404 })

  const notificationUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/graph`
  const clientState = process.env.MS_GRAPH_WEBHOOK_SECRET ?? ''

  const subscription = await createMailSubscription(mailbox.email, notificationUrl, clientState)

  await prisma.outlookMailbox.update({
    where: { id },
    data: {
      subscriptionId: subscription.id,
      subscriptionExpiry: new Date(subscription.expirationDateTime),
      actif: true,
    },
  })

  return NextResponse.json({ ok: true, subscriptionId: subscription.id, expiry: subscription.expirationDateTime })
}
