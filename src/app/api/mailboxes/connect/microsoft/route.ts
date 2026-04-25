import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
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
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/microsoft-mailbox/callback`

  const params = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'Mail.Read Mail.Send offline_access',
    response_mode: 'query',
    state,
  })

  return NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
  )
}
