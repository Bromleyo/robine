import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import RulesExtractionClient from '@/components/config/rules-extraction-client'

export default async function RulesExtractionPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/config/regles-ia')

  const mailboxes = await prisma.outlookMailbox.findMany({
    where: { restaurantId: session.user.restaurantId, actif: true },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  })

  if (mailboxes.length === 0) redirect('/config/mailboxes')

  return (
    <>
      <Topbar
        title="Extraction de règles IA"
        subtitle="Analyse one-shot de vos échanges email événementiels"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 1100 }}>
        <RulesExtractionClient mailboxes={mailboxes} />
      </div>
    </>
  )
}
