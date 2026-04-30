import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { sendGraphReply } from '@/lib/graph/messages'
import { resolveTargetMailbox } from '@/lib/graph/webhook-helpers'

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
    include: {
      contact: { select: { email: true } },
      threads: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        include: {
          messages: {
            where: { direction: 'IN', microsoftGraphId: { not: null } },
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: { microsoftGraphId: true },
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

  const internetMessageId = await sendGraphReply(targetMailbox, lastIn.microsoftGraphId, htmlBody, attachments)

  const now = new Date()
  await prisma.message.create({
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
  })

  await prisma.demande.update({
    where: { id },
    data: { lastMessageAt: now, lastMessageDirection: 'OUT' },
  })

  return NextResponse.json({ ok: true })
}
