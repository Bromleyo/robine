import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { fetchGraphMessage, graphMessageToNormalized } from '@/lib/graph/messages'
import { processIncomingEmail } from '@/lib/email/process-incoming'
import { logger } from '@/lib/logger'

const CLIENT_STATE = process.env.MS_GRAPH_WEBHOOK_SECRET ?? ''

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('validationToken')
  if (!token) return NextResponse.json({ error: 'Missing validationToken' }, { status: 400 })
  return new NextResponse(decodeURIComponent(token), {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

interface GraphNotification {
  value: {
    subscriptionId: string
    clientState: string
    changeType: string
    resourceData: { id: string }
  }[]
}

export async function POST(req: NextRequest) {
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new NextResponse(decodeURIComponent(validationToken), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  const body = await req.json() as GraphNotification

  for (const notif of body.value ?? []) {
    try {
      await processNotification(notif)
    } catch (err) {
      logger.error({ err }, 'webhook/graph notification error')
    }
  }

  return new NextResponse(null, { status: 202 })
}

async function processNotification(notif: GraphNotification['value'][number]) {
  logger.debug({ clientStateMatch: notif.clientState === CLIENT_STATE }, 'webhook clientState check')
  if (notif.clientState !== CLIENT_STATE) return

  const messageId = notif.resourceData?.id
  logger.debug({ messageId }, 'webhook messageId')
  if (!messageId) return

  let webhookEventId: string | null = null
  try {
    const event = await prisma.webhookEvent.create({
      data: { source: 'graph', externalId: `${notif.subscriptionId}:${messageId}` },
    })
    webhookEventId = event.id
  } catch {
    logger.info({ externalId: `${notif.subscriptionId}:${messageId}` }, 'webhook already processed, skipping')
    return
  }

  try {
    const mailbox = await prisma.outlookMailbox.findFirst({
      where: { subscriptionId: notif.subscriptionId },
      select: { id: true, email: true, restaurantId: true },
    })
    if (!mailbox) return

    const graphMsg = await fetchGraphMessage(mailbox.email, messageId)
    const email = graphMessageToNormalized(graphMsg)
    await processIncomingEmail(email, mailbox)
  } catch (err) {
    if (webhookEventId) {
      await prisma.webhookEvent.delete({ where: { id: webhookEventId } }).catch(() => null)
    }
    throw err
  }
}

