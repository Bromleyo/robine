import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { exchangeGoogleCode, getGoogleUserEmail } from '@/lib/google/auth'
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
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=gmail_denied`)
  }

  const restaurantId = verifyState(state)
  if (!restaurantId) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=invalid_state`)
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/gmail/callback`
  const tokens = await exchangeGoogleCode(code, redirectUri).catch(() => null)
  if (!tokens?.refresh_token) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=gmail_no_refresh_token`)
  }

  const email = await getGoogleUserEmail(tokens.access_token).catch(() => null)
  if (!email) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?error=gmail_no_email`)
  }

  await prisma.outlookMailbox.upsert({
    where: { restaurantId_email: { restaurantId, email } },
    update: {
      provider: 'GMAIL',
      msAccessToken: tokens.access_token,
      msRefreshToken: tokens.refresh_token,
      msTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      actif: true,
    },
    create: {
      restaurantId,
      email,
      displayName: email,
      provider: 'GMAIL',
      msAccessToken: tokens.access_token,
      msRefreshToken: tokens.refresh_token,
      msTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      actif: true,
    },
  })

  return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/config/mailboxes?success=gmail_connected`)
}
