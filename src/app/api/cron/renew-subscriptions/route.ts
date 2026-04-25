import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { renewMailSubscription } from '@/lib/graph/subscription'
import { logger } from '@/lib/logger'
import { verifyCronRequest } from '@/lib/cron-auth'

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const mailboxes = await prisma.outlookMailbox.findMany({
    where: {
      actif: true,
      subscriptionId: { not: null },
      subscriptionExpiry: { lte: threshold },
    },
    select: { id: true, subscriptionId: true, email: true, restaurantId: true },
  })

  const results: { email: string; ok: boolean; error?: string }[] = []

  for (const mailbox of mailboxes) {
    try {
      const newExpiry = await renewMailSubscription(mailbox.subscriptionId!)
      await prisma.outlookMailbox.update({
        where: { id: mailbox.id },
        data: { subscriptionExpiry: new Date(newExpiry) },
      })
      results.push({ email: mailbox.email, ok: true })
      logger.info({ email: mailbox.email, newExpiry }, 'subscription renewed')
    } catch (err) {
      logger.error({ err, email: mailbox.email }, 'cron/renew-subscriptions: failed to renew subscription')
      results.push({ email: mailbox.email, ok: false, error: String(err) })

      try {
        const admins = await prisma.membership.findMany({
          where: { restaurantId: mailbox.restaurantId, role: 'ADMIN' },
          select: { userId: true },
        })
        await Promise.all(admins.map(a =>
          prisma.notification.create({
            data: {
              userId: a.userId,
              restaurantId: mailbox.restaurantId,
              type: 'DEMANDE_URGENTE',
              titre: 'Échec renouvellement abonnement Graph',
              body: `La boîte ${mailbox.email} ne recevra plus de notifications email. Vérifiez la configuration.`,
            },
          })
        ))
      } catch (notifErr) {
        logger.error({ notifErr, email: mailbox.email }, 'failed to send renewal failure notification')
      }
    }
  }

  return NextResponse.json({ ok: true, renewed: results.length, results })
}
