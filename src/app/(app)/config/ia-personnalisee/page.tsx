import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import AIPersonalizationClient from '@/components/config/ai-personalization-client'

export default async function IAPersonnalisee() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const mailboxes = await prisma.outlookMailbox.findMany({
    where: { restaurantId: session.user.restaurantId, actif: true },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  })

  if (mailboxes.length === 0) redirect('/config/mailboxes')

  const record = await prisma.aIPersonalization.findUnique({
    where: { restaurantId: session.user.restaurantId },
    include: { mailbox: { select: { email: true, displayName: true } } },
  })

  const initialPersonalization = record
    ? {
        id: record.id,
        mailboxId: record.mailboxId,
        mailboxEmail: record.mailbox.email,
        mailboxDisplayName: record.mailbox.displayName,
        threadsAnalyzed: record.threadsAnalyzed,
        rulesMarkdown: record.rulesMarkdown,
        keywords: record.keywords,
        createdAt: record.createdAt.toISOString(),
      }
    : null

  return (
    <>
      <Topbar
        title="IA personnalisée"
        subtitle="Entraîne Robin sur ton style de communication événementielle"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 1100 }}>
        <AIPersonalizationClient mailboxes={mailboxes} initialPersonalization={initialPersonalization} />
      </div>
    </>
  )
}
