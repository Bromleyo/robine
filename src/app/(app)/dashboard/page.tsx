import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/topbar'
import DashboardClient from '@/components/dashboard/dashboard-client'
import RefreshButton from '@/components/dashboard/refresh-button'
import { fetchDemandesKanban } from '@/lib/db/demandes'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const demandes = await fetchDemandesKanban(session.user.restaurantId)

  const hotCount     = demandes.filter(d => d.urgenceLevel === 'hot').length
  const warnCount    = demandes.filter(d => d.urgenceLevel === 'warn').length
  const conflitCount = demandes.filter(d => d.conflitDetecte).length

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nouvellesAujourdhuiCount = demandes.filter(d =>
    new Date(d.createdAt) >= today && d.statut === 'NOUVELLE'
  ).length

  const caPotentielCents = demandes
    .filter(d => d.statut === 'CONFIRMEE' || d.statut === 'EN_COURS')
    .reduce((sum, d) => sum + (d.budgetIndicatifCents ?? 0), 0)

  const stats = [
    {
      label: 'Nouvelles', value: demandes.filter(d => d.statut === 'NOUVELLE').length,
      color: '#6366F1', sub: nouvellesAujourdhuiCount > 0 ? `+${nouvellesAujourdhuiCount} aujourd'hui` : null,
    },
    {
      label: 'En cours', value: demandes.filter(d => d.statut === 'EN_COURS').length,
      color: '#F59E0B', sub: conflitCount > 0 ? `${conflitCount} conflit${conflitCount > 1 ? 's' : ''}` : null,
    },
    {
      label: 'Confirmées', value: demandes.filter(d => d.statut === 'CONFIRMEE').length,
      color: '#10B981', sub: caPotentielCents > 0 ? `${Math.round(caPotentielCents / 100).toLocaleString('fr-FR')} € potentiel` : null,
    },
  ]

  return (
    <>
      <Topbar title="Tableau de bord" subtitle="Toutes les demandes en cours">
        <RefreshButton />
      </Topbar>

      {/* Stats bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>

        {/* Priority stat — expanded with colored squares */}
        <div style={{
          padding: '18px 24px',
          borderRight: '1px solid var(--hairline)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{
            fontSize: 11.5, color: 'var(--ink-500)', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
            À suivre en priorité
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{
              fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em',
              color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
            }}>{hotCount + warnCount}</div>
            {(hotCount + warnCount) > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--accent)' }}>
                demandes sans réponse &gt; 48h
              </div>
            )}
          </div>
          {/* Colored squares: rouge = hot (>48h), jaune = warn (24–48h) */}
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {Array.from({ length: Math.min(hotCount, 10) }, (_, i) => (
              <span key={`h${i}`} style={{ width: 18, height: 4, borderRadius: 2, background: 'var(--accent)' }} />
            ))}
            {Array.from({ length: Math.min(warnCount, 10 - Math.min(hotCount, 10)) }, (_, i) => (
              <span key={`w${i}`} style={{ width: 18, height: 4, borderRadius: 2, background: '#F59E0B' }} />
            ))}
            {(hotCount + warnCount) === 0 && (
              <span style={{ fontSize: 11.5, color: '#059669' }}>Tout est à jour ✓</span>
            )}
          </div>
        </div>

        {/* Other 3 stats */}
        {stats.map((s, i) => (
          <div key={i} style={{
            padding: '18px 24px',
            borderRight: i < 2 ? '1px solid var(--hairline)' : 'none',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{
              fontSize: 11.5, color: 'var(--ink-500)', fontWeight: 500,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
              {s.label}
            </div>
            <div style={{
              fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em',
              color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
            }}>{s.value}</div>
            {s.sub && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>{s.sub}</div>
            )}
          </div>
        ))}
      </div>

      <DashboardClient demandes={demandes} />
    </>
  )
}
