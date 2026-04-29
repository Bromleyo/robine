import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { fetchDemandesAll, countDemandesByView, type DemandesView } from '@/lib/db/demandes'
import { calculerUrgenceDemande } from '@/lib/business/urgence'
import Topbar from '@/components/layout/topbar'
import ViewTabs from '@/components/demandes/view-tabs'
import RestoreButton from '@/components/demandes/restore-button'

const STATUT_LABEL: Record<string, string> = {
  NOUVELLE: 'Nouvelle', EN_COURS: 'En cours',
  ATTENTE_CLIENT: 'Attente client', CONFIRMEE: 'Confirmée',
  ANNULEE: 'Annulée', PERDUE: 'Perdue',
}
const STATUT_COLOR: Record<string, string> = {
  NOUVELLE: '#6366F1', EN_COURS: '#D97706',
  ATTENTE_CLIENT: '#DC2626', CONFIRMEE: '#059669',
  ANNULEE: '#9CA3AF', PERDUE: '#9F1239',
}
const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'ent.", ANNIVERSAIRE: 'Anniversaire',
  SEMINAIRE: 'Séminaire', PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}

function formatDateShort(d: Date) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d)
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

export default async function DemandesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const sp = await searchParams
  const view: DemandesView =
    sp.view === 'archived' || sp.view === 'trash' ? sp.view : 'active'

  const [rows, counts] = await Promise.all([
    fetchDemandesAll(session.user.restaurantId, view),
    countDemandesByView(session.user.restaurantId),
  ])
  const now = new Date()
  const showRestore = view !== 'active'
  const restoreFrom: 'archive' | 'trash' = view === 'trash' ? 'trash' : 'archive'

  const enriched = rows.map(d => {
    const urgence = calculerUrgenceDemande({
      statut: d.statut,
      dateEvenement: d.dateEvenement,
      now,
      lastMessageAt: d.lastMessageAt,
      lastMessageDirection: d.lastMessageDirection,
    })
    return { ...d, urgenceLevel: urgence.level }
  })

  return (
    <>
      <Topbar
        title="Demandes"
        subtitle={`${rows.length} demande${rows.length > 1 ? 's' : ''}`}
        hidePrimary={view !== 'active'}
      />

      <ViewTabs
        active={counts.active}
        archived={counts.archived}
        trash={counts.trash}
        current={view}
      />

      <div style={{
        padding: '10px 24px', background: 'var(--surface)',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <a
          href="/api/demandes/export"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 500, color: 'var(--ink-600)',
            padding: '5px 10px', borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)', textDecoration: 'none',
            background: 'var(--surface)',
          }}
        >
          ↓ Exporter CSV
        </a>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Référence', 'Contact', 'Type', 'Date événement', 'Statut', 'Dernier message'].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: 'left',
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--ink-400)',
                  background: 'var(--surface)', position: 'sticky', top: 0,
                  borderBottom: '1px solid var(--border)',
                }}>{h}</th>
              ))}
              {showRestore && (
                <th style={{
                  padding: '10px 16px', textAlign: 'right',
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--ink-400)',
                  background: 'var(--surface)', position: 'sticky', top: 0,
                  borderBottom: '1px solid var(--border)',
                }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 && (
              <tr>
                <td colSpan={showRestore ? 7 : 6} style={{
                  padding: '48px 16px', textAlign: 'center',
                  color: 'var(--ink-400)', fontSize: 13,
                }}>Aucune demande</td>
              </tr>
            )}
            {enriched.map((d, i) => (
              <tr key={d.id} style={{
                borderBottom: '1px solid var(--hairline)',
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
              }}>
                <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                  <Link href={`/demandes/${d.id}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    textDecoration: 'none', color: 'var(--ink-900)',
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: d.urgenceLevel === 'hot' ? 'var(--accent)'
                        : d.urgenceLevel === 'warn' ? '#F59E0B' : '#D1D5DB',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 550 }}>{d.reference}</span>
                  </Link>
                </td>

                <td style={{ padding: '11px 16px' }}>
                  <Link href={`/demandes/${d.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{d.contact.nom}</div>
                    {d.contact.societe && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>{d.contact.societe}</div>
                    )}
                  </Link>
                </td>

                <td style={{ padding: '11px 16px' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>
                    {d.typeEvenement ? (EVENT_LABEL[d.typeEvenement] ?? d.typeEvenement) : '—'}
                  </span>
                </td>

                <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>
                    {d.dateEvenement ? formatDateShort(d.dateEvenement) : '—'}
                  </span>
                </td>

                <td style={{ padding: '11px 16px' }}>
                  <span style={{
                    display: 'inline-block', fontSize: 12, fontWeight: 500,
                    padding: '3px 9px', borderRadius: 10,
                    background: `${STATUT_COLOR[d.statut] ?? '#6B7280'}18`,
                    color: STATUT_COLOR[d.statut] ?? '#6B7280',
                  }}>
                    {STATUT_LABEL[d.statut] ?? d.statut}
                  </span>
                </td>

                <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                    {d.lastMessageAt ? formatDate(d.lastMessageAt) : '—'}
                  </span>
                </td>

                {showRestore && (
                  <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <RestoreButton demandeId={d.id} from={restoreFrom} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
