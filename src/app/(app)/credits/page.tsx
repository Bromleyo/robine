import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import PurchaseButton from '@/components/credits/purchase-button'

const TYPE_LABEL: Record<string, string> = {
  GIFT: 'Cadeau de bienvenue',
  PURCHASE: 'Achat',
  CONSUME: 'Analyse IA',
  REFUND: 'Remboursement',
}

export default async function CreditsPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const restaurantId = session.user.restaurantId

  const credits = await prisma.aICredits.upsert({
    where: { restaurantId },
    update: {},
    create: { restaurantId, balance: 1 },
  })

  const transactions = await prisma.aICreditTransaction.findMany({
    where: { restaurantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <>
      <Topbar title="Crédits IA" subtitle="Gérer vos crédits d'analyse IA" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 640 }}>

        <div style={{
          padding: '24px 28px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Solde actuel
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {credits.balance}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-500)', marginLeft: 6 }}>
                crédit{credits.balance !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <PurchaseButton />
        </div>

        {transactions.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Historique
            </div>
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              overflow: 'hidden',
            }}>
              {transactions.map((t, i) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderTop: i > 0 ? '1px solid var(--hairline)' : undefined,
                }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 450 }}>
                      {t.description ?? TYPE_LABEL[t.type] ?? t.type}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 1 }}>
                      {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(t.createdAt)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: t.amount > 0 ? 'var(--success-ink, #166534)' : 'var(--ink-600)',
                  }}>
                    {t.amount > 0 ? '+' : ''}{t.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
