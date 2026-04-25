import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { createMailSubscription } from '@/lib/graph/subscription'

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { emailGroupes: true },
  })
  if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })

  const mailboxEmail = (restaurant.emailGroupes.split(',')[0] ?? '').trim()
  const notificationUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/graph`
  const clientState = process.env.MS_GRAPH_WEBHOOK_SECRET ?? ''

  try {
    const subscription = await createMailSubscription(mailboxEmail, notificationUrl, clientState)

    await prisma.outlookMailbox.upsert({
      where: { restaurantId_email: { restaurantId: session.user.restaurantId, email: mailboxEmail } },
      update: {
        subscriptionId: subscription.id,
        subscriptionExpiry: new Date(subscription.expirationDateTime),
      },
      create: {
        restaurantId: session.user.restaurantId,
        email: mailboxEmail,
        subscriptionId: subscription.id,
        subscriptionExpiry: new Date(subscription.expirationDateTime),
      },
    })

    return NextResponse.json({
      ok: true,
      mailbox: mailboxEmail,
      subscriptionId: subscription.id,
      expiry: subscription.expirationDateTime,
    })
  } catch (err) {
    console.error('[setup-subscription]', err)
    return NextResponse.json({ error: 'Une erreur interne est survenue' }, { status: 500 })
  }
}
