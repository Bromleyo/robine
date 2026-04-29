import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

type Blacklist = { senders: string[]; domains: string[] }

function readBlacklist(raw: unknown): Blacklist {
  const obj = (raw as { senders?: unknown; domains?: unknown } | null) ?? null
  if (!obj || typeof obj !== 'object') return { senders: [], domains: [] }
  const senders = Array.isArray(obj.senders) ? obj.senders.filter((s): s is string => typeof s === 'string') : []
  const domains = Array.isArray(obj.domains) ? obj.domains.filter((s): s is string => typeof s === 'string') : []
  return { senders, domains }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const restaurantId = session?.user?.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forbidden = requireRole(session?.user?.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    addToBlacklist?: { type: 'sender' | 'domain'; value: string }
  }

  const demande = await prisma.demande.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      reference: true,
      archivedAt: true,
      threads: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          id: true,
          messages: {
            where: { direction: 'IN' },
            orderBy: { receivedAt: 'asc' },
            take: 1,
            select: {
              microsoftGraphId: true,
              fromEmail: true,
              fromName: true,
              subject: true,
              bodyText: true,
              receivedAt: true,
            },
          },
        },
      },
    },
  })
  if (!demande) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (demande.archivedAt) {
    return NextResponse.json({ error: 'Demande déjà archivée' }, { status: 409 })
  }

  const message = demande.threads[0]?.messages[0]

  const senderSuggestion = message?.fromEmail?.toLowerCase() ?? null
  const domainSuggestion = senderSuggestion?.includes('@')
    ? senderSuggestion.slice(senderSuggestion.lastIndexOf('@') + 1)
    : null

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { restaurantId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  const microsoftGraphId = message?.microsoftGraphId ?? `manually_archived:${demande.id}`

  await prisma.$transaction(async (tx) => {
    await tx.demande.update({
      where: { id: demande.id },
      data: { archivedAt: new Date(), archivedReason: 'manually_archived' },
    })

    if (mailbox && message) {
      await tx.rejectedEmail.upsert({
        where: { microsoftGraphId },
        update: {
          rejectReason: 'manually_archived',
          details: `archived from demande ${demande.reference}`,
        },
        create: {
          restaurantId,
          mailboxId: mailbox.id,
          microsoftGraphId,
          fromEmail: message.fromEmail,
          fromName: message.fromName,
          subject: message.subject,
          rejectReason: 'manually_archived',
          details: `archived from demande ${demande.reference}`,
          bodySnippet: message.bodyText?.slice(0, 400) ?? null,
          receivedAt: message.receivedAt ?? new Date(),
        },
      })
    }

    if (body.addToBlacklist) {
      const { type, value } = body.addToBlacklist
      const v = value.trim().toLowerCase()
      if (v && (type === 'sender' || type === 'domain')) {
        const r = await tx.restaurant.findUnique({
          where: { id: restaurantId },
          select: { blacklistAdditions: true },
        })
        const bl = readBlacklist(r?.blacklistAdditions)
        if (type === 'sender' && !bl.senders.includes(v)) bl.senders.push(v)
        if (type === 'domain' && !bl.domains.includes(v)) bl.domains.push(v)
        await tx.restaurant.update({
          where: { id: restaurantId },
          data: { blacklistAdditions: bl },
        })
      }
    }
  })

  return NextResponse.json({
    archived: true,
    blacklistSuggestion: {
      sender: senderSuggestion,
      domain: domainSuggestion,
    },
  })
}
