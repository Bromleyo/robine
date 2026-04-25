import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createHmac } from 'crypto'

function verifyState(state: string): string | null {
  const dotIdx = state.lastIndexOf('.')
  if (dotIdx === -1) return null
  const restaurantId = state.slice(0, dotIdx)
  const hmac = state.slice(dotIdx + 1)
  const expected = createHmac('sha256', process.env.NEXTAUTH_SECRET!).update(restaurantId).digest('hex')
  if (hmac !== expected) return null
  return restaurantId
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=ms_denied`)
  }

  const restaurantId = verifyState(state)
  if (!restaurantId) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=invalid_state`)
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/microsoft-mailbox/callback`

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'Mail.Read Mail.Send offline_access',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=ms_token_failed`)
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  if (!tokens.refresh_token) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=ms_no_refresh_token`)
  }

  const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!meRes.ok) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=ms_no_profile`)
  }

  const me = await meRes.json() as { mail?: string; userPrincipalName?: string; displayName?: string }
  const email = (me.mail ?? me.userPrincipalName ?? '').toLowerCase()
  if (!email) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=ms_no_email`)
  }

  await prisma.outlookMailbox.upsert({
    where: { restaurantId_email: { restaurantId, email } },
    update: {
      provider: 'MICROSOFT',
      displayName: me.displayName ?? email,
      msAccessToken: tokens.access_token,
      msRefreshToken: tokens.refresh_token,
      msTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      actif: true,
    },
    create: {
      restaurantId,
      email,
      displayName: me.displayName ?? email,
      provider: 'MICROSOFT',
      msAccessToken: tokens.access_token,
      msRefreshToken: tokens.refresh_token,
      msTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      actif: true,
    },
  })

  return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?success=ms_connected`)
}
