import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'

function fmtPct(n: number) {
  return `${Math.round(n * 100)} %`
}

const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise",
  ANNIVERSAIRE: 'Anniversaire', SEMINAIRE: 'Séminaire',
  PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}

const STATUT_COLOR: Record<string, string> = {
  NOUVELLE: '#6366F1', EN_COURS: '#F59E0B',
  ATTENTE_CLIENT: '#DC2626', CONFIRMEE: '#059669',
  ANNULEE: '#9CA3AF', PERDUE: '#9F1239',
}

const STATUT_LABEL: Record<string, string> = {
  NOUVELLE: 'Nouvelle', EN_COURS: 'En cours',
  ATTENTE_CLIENT: 'Attente client', CONFIRMEE: 'Confirmée',
  ANNULEE: 'Annulée', PERDUE: 'Perdue',
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: '20px 24px',
    }}>{children}</div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: 'var(--ink-400)', marginBottom: 14,
    }}>{children}</div>
  )
}

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')
  const restaurantId = session.user.restaurantId

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [byStatut, byType, allDemandes, rejectedByReason, emailDemandesByMethod] = await Promise.all([
    prisma.demande.groupBy({
      by: ['statut'],
      where: { restaurantId },
      _count: { id: true },
    }),
    prisma.demande.groupBy({
      by: ['typeEvenement'],
      where: { restaurantId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.demande.findMany({
      where: { restaurantId },
      select: { createdAt: true, statut: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.rejectedEmail.groupBy({
      by: ['rejectReason'],
      where: { restaurantId, createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
    prisma.demande.groupBy({
      by: ['classificationMethod'],
      where: { restaurantId, origine: 'EMAIL', createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
  ])

  type StatutRow = { statut: string; _count: { id: number } }
  type TypeRow = { typeEvenement: string | null; _count: { id: number } }
  type DemandeItem = { createdAt: Date; statut: string }
  type RejectedRow = { rejectReason: string; _count: { id: number } }
  type MethodRow = { classificationMethod: string | null; _count: { id: number } }

  const byStatutT = byStatut as StatutRow[]
  const byTypeT = byType as TypeRow[]
  const allDemandesT = allDemandes as DemandeItem[]
  const rejectedByReasonT = rejectedByReason as RejectedRow[]
  const emailDemandesByMethodT = emailDemandesByMethod as MethodRow[]

  const total = allDemandesT.length
  const confirmedCount = byStatutT.find((r) => r.statut === 'CONFIRMEE')?._count.id ?? 0
  const activeTotal = allDemandesT.filter((d) => d.statut !== 'ANNULEE' && d.statut !== 'PERDUE').length
  const conversionRate = activeTotal > 0 ? confirmedCount / activeTotal : 0
  const monthMap = new Map<string, number>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, 0)
  }
  for (const d of allDemandesT) {
    const key = `${d.createdAt.getFullYear()}-${String(d.createdAt.getMonth() + 1).padStart(2, '0')}`
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) ?? 0) + 1)
  }
  const monthEntries = [...monthMap.entries()]
  const maxMonth = Math.max(...monthEntries.map(([, v]) => v), 1)

  const typeMax = Math.max(...byTypeT.map(r => r._count.id), 1)

  const statutOrder = ['NOUVELLE', 'EN_COURS', 'ATTENTE_CLIENT', 'CONFIRMEE', 'ANNULEE', 'PERDUE']
  const byStatutSorted = [...byStatutT].sort((a, b) => statutOrder.indexOf(a.statut) - statutOrder.indexOf(b.statut))

  return (
    <>
      <Topbar title="Analytique" subtitle="Vue d'ensemble de l'activité" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {[
            { label: 'Total demandes', value: String(total), sub: 'toutes périodes' },
            { label: 'Confirmées', value: String(confirmedCount), sub: `${fmtPct(conversionRate)} de conversion`, color: '#059669' },
          ].map(kpi => (
            <Card key={kpi.label}>
              <div style={{ fontSize: 11, color: 'var(--ink-400)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{kpi.label}</div>
              <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: '-0.02em', color: kpi.color ?? 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 5 }}>{kpi.sub}</div>
            </Card>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* By statut */}
          <Card>
            <CardTitle>Répartition par statut</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byStatutSorted.map(row => {
                const pct = total > 0 ? row._count.id / total : 0
                const color = STATUT_COLOR[row.statut] ?? '#6B7280'
                return (
                  <div key={row.statut}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span style={{ color: 'var(--ink-700)' }}>{STATUT_LABEL[row.statut] ?? row.statut}</span>
                      <span style={{ fontWeight: 550, fontVariantNumeric: 'tabular-nums' }}>{row._count.id}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* By type */}
          <Card>
            <CardTitle>Demandes par type d'événement</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byTypeT.filter(r => r.typeEvenement).map(row => {
                const pct = row._count.id / typeMax
                return (
                  <div key={row.typeEvenement}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span style={{ color: 'var(--ink-700)' }}>{EVENT_LABEL[row.typeEvenement!] ?? row.typeEvenement}</span>
                      <span style={{ fontWeight: 550, fontVariantNumeric: 'tabular-nums' }}>{row._count.id}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct * 100}%`, background: '#6366F1', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
              {byTypeT.every(r => !r.typeEvenement) && (
                <div style={{ fontSize: 13, color: 'var(--ink-300)', fontStyle: 'italic' }}>Aucune donnée</div>
              )}
            </div>
          </Card>
        </div>

        {/* Filter efficiency */}
        <Card>
          <CardTitle>Efficacité des filtres — 30 derniers jours</CardTitle>
          {(() => {
            const totalRejected = rejectedByReasonT.reduce((s, r) => s + r._count.id, 0)
            const acceptDirect = emailDemandesByMethodT.find(r => r.classificationMethod === 'rules_hard_positive')?._count.id ?? 0
            const viallLlm = emailDemandesByMethodT.find(r => r.classificationMethod === 'ai')?._count.id ?? 0
            const totalReceived = totalRejected + acceptDirect + viallLlm
            const llmSaved = totalRejected + acceptDirect
            const llmCostEur = (llmSaved * 0.001).toFixed(2)
            const REASON_LABEL: Record<string, string> = {
              not_addressed: 'Pas destinataire', spam_headers: 'Headers spam',
              noreply_sender: 'Expéditeur noreply', prospection: 'Prospection',
              blacklisted_domain: 'Domaine blacklisté',
            }
            const REASON_COLOR: Record<string, string> = {
              not_addressed: '#6B7280', spam_headers: '#9CA3AF',
              noreply_sender: '#9CA3AF', prospection: '#DC2626',
              blacklisted_domain: '#9F1239',
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Emails reçus', value: String(totalReceived) },
                    { label: 'Rejetés par filtres', value: String(totalRejected), color: '#DC2626' },
                    { label: 'Acceptés sans LLM', value: String(acceptDirect), color: '#6366F1' },
                    { label: 'Via LLM', value: String(viallLlm), color: '#F59E0B' },
                    { label: 'Appels LLM économisés', value: `~${llmSaved} (≈ ${llmCostEur} €)`, color: '#059669' },
                  ].map(k => (
                    <div key={k.label} style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 650, color: k.color ?? 'var(--ink-900)', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                    </div>
                  ))}
                </div>
                {rejectedByReasonT.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rejectedByReasonT.sort((a, b) => b._count.id - a._count.id).map(row => {
                      const pct = totalRejected > 0 ? row._count.id / totalRejected : 0
                      const color = REASON_COLOR[row.rejectReason] ?? '#6B7280'
                      return (
                        <div key={row.rejectReason}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12.5 }}>
                            <span style={{ color: 'var(--ink-600)' }}>{REASON_LABEL[row.rejectReason] ?? row.rejectReason}</span>
                            <span style={{ fontWeight: 550, fontVariantNumeric: 'tabular-nums' }}>{row._count.id}</span>
                          </div>
                          <div style={{ height: 4, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 3 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {rejectedByReasonT.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--ink-300)', fontStyle: 'italic' }}>Aucun email rejeté sur cette période.</div>
                )}
              </div>
            )
          })()}
        </Card>

        {/* Monthly volume */}
        <Card>
          <CardTitle>Volume mensuel — 12 derniers mois</CardTitle>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {monthEntries.map(([key, count]) => {
              const [year, month] = key.split('-')
              const label = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(Number(year), Number(month) - 1, 1))
              const barH = maxMonth > 0 ? Math.max((count / maxMonth) * 80, count > 0 ? 6 : 0) : 0
              return (
                <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 550, color: count > 0 ? 'var(--ink-700)' : 'var(--ink-300)', fontVariantNumeric: 'tabular-nums' }}>
                    {count > 0 ? count : ''}
                  </span>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '70%', height: barH, background: '#6366F1', borderRadius: '3px 3px 0 0', minHeight: count > 0 ? 6 : 0 }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--ink-400)', textTransform: 'capitalize' }}>{label}</span>
                </div>
              )
            })}
          </div>
        </Card>

      </div>
    </>
  )
}
