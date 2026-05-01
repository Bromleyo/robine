import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { sendGraphReply } from '@/lib/graph/messages'
import { resolveTargetMailbox } from '@/lib/graph/webhook-helpers'
import { GraphRequestError, categorizeGraphError } from '@/lib/graph/errors'
import { logger } from '@/lib/logger'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { body: replyText, attachments } = await req.json() as { body: string; attachments?: { name: string; url: string }[] }
  if (!replyText?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const demande = await prisma.demande.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
    select: {
      id: true,
      statut: true,
      contact: { select: { email: true } },
      threads: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          id: true,
          messages: {
            where: { direction: 'IN', microsoftGraphId: { not: null } },
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: { microsoftGraphId: true },
          },
          _count: {
            select: { messages: { where: { direction: 'OUT' } } },
          },
        },
      },
    },
  })
  if (!demande) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thread = demande.threads[0]
  if (!thread) return NextResponse.json({ error: 'No thread' }, { status: 400 })

  const lastIn = thread.messages[0]
  if (!lastIn?.microsoftGraphId) {
    return NextResponse.json({ error: 'No Graph message to reply to' }, { status: 400 })
  }

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { restaurantId: session.user.restaurantId, actif: true },
    select: { email: true, sharedMailboxEmail: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'No mailbox configured' }, { status: 400 })

  // Cible Graph = sharedMailboxEmail si la mailbox est une boîte partagée,
  // sinon l'email du compte. Le microsoftGraphId reçu est dans cette cible-là
  // (cf. PR1ter Fix #1 côté webhook).
  const targetMailbox = resolveTargetMailbox(mailbox)

  if (replyText.length > 50000) return NextResponse.json({ error: 'Message trop long' }, { status: 400 })

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const htmlBody = replyText
    .split('\n\n')
    .map(p => `<p>${escHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')

  let internetMessageId: string
  try {
    internetMessageId = await sendGraphReply(targetMailbox, lastIn.microsoftGraphId, htmlBody, attachments)
  } catch (err) {
    if (err instanceof GraphRequestError) {
      const cat = categorizeGraphError(err)
      logger.error({
        kind: cat.kind,
        graphCode: err.graphCode,
        graphMessage: err.graphMessage,
        graphStatus: err.status,
        operation: err.operation,
        mailboxEmail: err.mailboxEmail,
        graphMessageId: err.graphMessageId,
        demandeId: id,
      }, cat.kind)
      return NextResponse.json(
        { error: cat.code, status: err.status, hint: cat.hint },
        { status: cat.httpStatus },
      )
    }
    throw err
  }

  const now = new Date()
  // PR2 — R1 : si NOUVELLE + premier OUT du thread → bascule EN_COURS.
  // _count.messages compte les OUT existants AVANT insertion ; "premier OUT"
  // = ce count est à 0 maintenant.
  const wasFirstOut = thread._count.messages === 0
  const shouldTransition = demande.statut === 'NOUVELLE' && wasFirstOut

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: thread.id,
        messageIdHeader: internetMessageId,
        direction: 'OUT',
        fromEmail: targetMailbox,
        toEmails: [demande.contact.email],
        bodyHtml: htmlBody,
        bodyText: replyText,
        sentAt: now,
      },
    }),
    prisma.demande.update({
      where: { id },
      data: {
        lastMessageAt: now,
        lastMessageDirection: 'OUT',
        // R1 + bouton "Envoyer" : marque la demande comme vue.
        lastSeenByAssigneeAt: now,
        ...(shouldTransition ? { statut: 'EN_COURS' as const } : {}),
      },
    }),
  ])

  if (shouldTransition) {
    logger.info({
      demandeId: id,
      from: 'NOUVELLE',
      to: 'EN_COURS',
      reason: 'first_out_sent',
      transition: 'R1',
    }, '[demande] auto status transition R1')
  }

  return NextResponse.json({ ok: true })
}
