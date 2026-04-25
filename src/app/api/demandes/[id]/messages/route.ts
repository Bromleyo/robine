import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { sendGraphReply } from '@/lib/graph/messages'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { body: replyText } = await req.json() as { body: string }
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
    select: { email: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'No mailbox configured' }, { status: 400 })

  if (replyText.length > 50000) return NextResponse.json({ error: 'Message trop long' }, { status: 400 })

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const htmlBody = replyText
    .split('\n\n')
    .map(p => `<p>${escHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')

  const internetMessageId = await sendGraphReply(mailbox.email, lastIn.microsoftGraphId, htmlBody)

  const now = new Date()
  await prisma.message.create({
    data: {
      threadId: thread.id,
      messageIdHeader: internetMessageId,
      direction: 'OUT',
      fromEmail: mailbox.email,
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
