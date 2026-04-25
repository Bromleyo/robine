import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { buildGoogleAuthUrl } from '@/lib/google/auth'
import { createHmac } from 'crypto'

function signState(restaurantId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET!).update(restaurantId).digest('hex')
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const restaurantId = session.user.restaurantId
  const state = `${restaurantId}.${signState(restaurantId)}`
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/gmail/callback`
  const url = buildGoogleAuthUrl(redirectUri, state)

  return NextResponse.redirect(url)
}
