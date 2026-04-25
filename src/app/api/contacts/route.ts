import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { fetchContactsList } from '@/lib/db/contacts'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contacts = await fetchContactsList(session.user.restaurantId)
  return NextResponse.json(contacts)
}
