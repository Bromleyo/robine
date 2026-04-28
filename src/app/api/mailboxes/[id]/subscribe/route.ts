import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { createMailSubscriptionDelegated } from '@/lib/graph/subscription'
import { encryptToken, decryptToken } from '@/lib/crypto/token-cipher'

async function refreshMicrosoftToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      scope: 'Mail.Read Mail.Send offline_access',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

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
    select: { id: true, email: true, sharedMailboxEmail: true, msAccessToken: true, msRefreshToken: true, msTokenExpiry: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'Boîte introuvable' }, { status: 404 })
  if (!mailbox.msRefreshToken) return NextResponse.json({ error: 'Aucun token délégué — reconnectez la boîte' }, { status: 400 })

  const needsRefresh = !mailbox.msTokenExpiry || mailbox.msTokenExpiry.getTime() - Date.now() < 5 * 60_000
  let accessToken = decryptToken(mailbox.msAccessToken!)

  if (needsRefresh) {
    const refreshed = await refreshMicrosoftToken(decryptToken(mailbox.msRefreshToken))
    accessToken = refreshed.access_token
    await prisma.outlookMailbox.update({
      where: { id },
      data: {
        msAccessToken: encryptToken(refreshed.access_token),
        msTokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    })
  }

  const notificationUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/graph`
  const clientState = process.env.MS_GRAPH_WEBHOOK_SECRET ?? ''

  const subscription = await createMailSubscriptionDelegated(accessToken, notificationUrl, clientState, mailbox.sharedMailboxEmail ?? undefined)

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
