import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden
  const restaurantId = session.user.restaurantId

  const body = await req.json().catch(() => ({})) as { email?: string; displayName?: string }
  const email = body.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

  const mailbox = await prisma.outlookMailbox.upsert({
    where: { restaurantId_email: { restaurantId, email } },
    create: { restaurantId, email, displayName: body.displayName?.trim() || null },
    update: { displayName: body.displayName?.trim() || undefined },
    select: { id: true, email: true, displayName: true, actif: true, subscriptionId: true, subscriptionExpiry: true, createdAt: true },
  })

  return NextResponse.json(mailbox, { status: 201 })
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const mailboxes = await prisma.outlookMailbox.findMany({
    where: { restaurantId },
    select: {
      id: true,
      email: true,
      displayName: true,
      provider: true,
      actif: true,
      subscriptionId: true,
      subscriptionExpiry: true,
      sharedMailboxEmail: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(mailboxes)
}
