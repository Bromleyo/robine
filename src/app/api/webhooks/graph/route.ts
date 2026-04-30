import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { fetchGraphMessage, graphMessageToNormalized } from '@/lib/graph/messages'
import { processIncomingEmail } from '@/lib/email/process-incoming'
import { logger } from '@/lib/logger'
import {
  isLifecycleNotification,
  resolveTargetMailbox,
  type GraphLifecycleNotification,
  type GraphRegularNotification,
} from '@/lib/graph/webhook-helpers'

const CLIENT_STATE = process.env.MS_GRAPH_WEBHOOK_SECRET ?? ''

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('validationToken')
  if (!token) return NextResponse.json({ error: 'Missing validationToken' }, { status: 400 })
  return new NextResponse(decodeURIComponent(token), {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

interface GraphNotificationBody {
  value: (GraphRegularNotification | GraphLifecycleNotification)[]
}

export async function POST(req: NextRequest) {
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new NextResponse(decodeURIComponent(validationToken), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  const body = await req.json() as GraphNotificationBody

  for (const notif of body.value ?? []) {
    try {
      if (isLifecycleNotification(notif)) {
        await processLifecycleNotification(notif)
      } else {
        await processNotification(notif)
      }
    } catch (err) {
      logger.error({ err }, 'webhook/graph notification error')
    }
  }

  return new NextResponse(null, { status: 202 })
}

async function processLifecycleNotification(notif: GraphLifecycleNotification) {
  // Validate clientState as defense-in-depth (Microsoft includes it on lifecycle notifs too)
  if (notif.clientState && notif.clientState !== CLIENT_STATE) {
    logger.warn({ subscriptionId: notif.subscriptionId, lifecycleEvent: notif.lifecycleEvent }, 'webhook/graph lifecycle clientState mismatch')
    return
  }

  logger.info({
    subscriptionId: notif.subscriptionId,
    lifecycleEvent: notif.lifecycleEvent,
    expiry: notif.subscriptionExpirationDateTime,
  }, 'webhook/graph lifecycle event received')

  if (notif.lifecycleEvent === 'subscriptionRemoved') {
    // Microsoft a supprimé la sub : on déconnecte côté DB pour que le cron
    // polling (Fix #2) continue à fetcher les emails et que l'utilisateur
    // puisse recréer manuellement la sub via "Activer Webhook".
    const updated = await prisma.outlookMailbox.updateMany({
      where: { subscriptionId: notif.subscriptionId },
      data: { subscriptionId: null, subscriptionExpiry: null },
    })
    logger.info({ subscriptionId: notif.subscriptionId, rows: updated.count }, 'webhook/graph subscriptionRemoved → cleared DB')
  }

  // 'missed' et 'reauthorizationRequired' : on log seulement.
  // missed = le cron polling ramassera les emails manqués (filet de sécurité).
  // reauthorizationRequired = on n'utilise pas de delegated tokens pour la sub
  // applicative principale, donc rare. À traiter manuellement si ça arrive.
}

async function processNotification(notif: GraphRegularNotification) {
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
      select: { id: true, email: true, sharedMailboxEmail: true, restaurantId: true },
    })
    if (!mailbox) return

    // La subscription Graph peut cibler la sharedMailboxEmail (boîte partagée)
    // au lieu de email (compte utilisateur). Fetch contre la cible réelle de la subscription.
    const targetMailbox = resolveTargetMailbox(mailbox)
    const graphMsg = await fetchGraphMessage(targetMailbox, messageId)
    const email = graphMessageToNormalized(graphMsg)
    await processIncomingEmail(email, mailbox)
  } catch (err) {
    if (webhookEventId) {
      await prisma.webhookEvent.delete({ where: { id: webhookEventId } }).catch(() => null)
    }
    throw err
  }
}

