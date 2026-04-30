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
    select: { id: true, email: true, sharedMailboxEmail: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'Boîte introuvable' }, { status: 404 })

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const notificationUrl = bypassSecret
    ? `${process.env.NEXTAUTH_URL}/api/webhooks/graph?x-vercel-protection-bypass=${bypassSecret}`
    : `${process.env.NEXTAUTH_URL}/api/webhooks/graph`
  const clientState = process.env.MS_GRAPH_WEBHOOK_SECRET ?? ''
  const targetEmail = mailbox.sharedMailboxEmail ?? mailbox.email

  let subscription: { id: string; expirationDateTime: string }
  try {
    // lifecycleNotificationUrl = même endpoint, distingué via le champ `lifecycleEvent` du payload.
    subscription = await createMailSubscription(targetEmail, notificationUrl, clientState, notificationUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

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
