import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

type Blacklist = { senders: string[]; domains: string[] }

function readBlacklist(raw: unknown): Blacklist {
  const obj = (raw as { senders?: unknown; domains?: unknown } | null) ?? null
  if (!obj || typeof obj !== 'object') return { senders: [], domains: [] }
  const senders = Array.isArray(obj.senders)
    ? obj.senders.filter((s): s is string => typeof s === 'string')
    : []
  const domains = Array.isArray(obj.domains)
    ? obj.domains.filter((s): s is string => typeof s === 'string')
    : []
  return { senders, domains }
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function isValidDomain(s: string): boolean {
  return !s.includes('@') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(s)
}

export async function GET() {
  const session = await auth()
  const restaurantId = session?.user?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { blacklistAdditions: true },
  })
  return NextResponse.json({ blacklist: readBlacklist(r?.blacklistAdditions) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const restaurantId = session?.user?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forbidden = requireRole(session?.user?.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const body = (await req.json().catch(() => ({}))) as {
    type?: 'sender' | 'domain'
    value?: string
  }

  const type = body.type
  const valueRaw = (body.value ?? '').trim().toLowerCase()

  if (!type || (type !== 'sender' && type !== 'domain')) {
    return NextResponse.json({ error: "type doit être 'sender' ou 'domain'" }, { status: 400 })
  }
  if (!valueRaw) {
    return NextResponse.json({ error: 'value requis' }, { status: 400 })
  }
  if (type === 'sender' && !isValidEmail(valueRaw)) {
    return NextResponse.json({ error: "value n'est pas un email valide" }, { status: 400 })
  }
  if (type === 'domain' && !isValidDomain(valueRaw)) {
    return NextResponse.json({ error: "value n'est pas un domaine valide" }, { status: 400 })
  }

  const current = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { blacklistAdditions: true },
  })
  const blacklist = readBlacklist(current?.blacklistAdditions)

  if (type === 'sender' && !blacklist.senders.includes(valueRaw)) {
    blacklist.senders.push(valueRaw)
  } else if (type === 'domain' && !blacklist.domains.includes(valueRaw)) {
    blacklist.domains.push(valueRaw)
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { blacklistAdditions: blacklist },
  })

  return NextResponse.json({ ok: true, blacklist })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  const restaurantId = session?.user?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forbidden = requireRole(session?.user?.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const body = (await req.json().catch(() => ({}))) as {
    type?: 'sender' | 'domain'
    value?: string
  }
  const type = body.type
  const valueRaw = (body.value ?? '').trim().toLowerCase()
  if (!type || (type !== 'sender' && type !== 'domain') || !valueRaw) {
    return NextResponse.json({ error: 'type et value requis' }, { status: 400 })
  }

  const current = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { blacklistAdditions: true },
  })
  const blacklist = readBlacklist(current?.blacklistAdditions)

  if (type === 'sender') blacklist.senders = blacklist.senders.filter(v => v !== valueRaw)
  else blacklist.domains = blacklist.domains.filter(v => v !== valueRaw)

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { blacklistAdditions: blacklist },
  })

  return NextResponse.json({ ok: true, blacklist })
}
