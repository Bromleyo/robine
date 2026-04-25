import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchContactDetail } from '@/lib/db/contacts'
import ContactEditForm from '@/components/contacts/contact-edit-form'
import AnonymizeButton from '@/components/contacts/anonymize-button'
import Icon from '@/components/ui/icon'

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

function formatDate(d: Date | string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
}

function formatCA(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function initials(nom: string) {
  return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const { id } = await params
  const contact = await fetchContactDetail(session.user.restaurantId, id)
  if (!contact) notFound()

  const avatarBg = contact.societe ? '#8B5CF6' : '#0EA5E9'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 24px', height: 56, flexShrink: 0,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <Link href="/contacts" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: 'var(--ink-500)', fontSize: 13, textDecoration: 'none',
          padding: '4px 8px', borderRadius: 'var(--r-sm)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Contacts
        </Link>
        <span style={{ color: 'var(--border-strong)', fontSize: 16 }}>/</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)' }}>{contact.nom}</span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left panel */}
        <div style={{
          width: 300, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: '20px 18px 32px',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>

          {/* Avatar + name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: avatarBg, color: '#fff',
                display: 'grid', placeItems: 'center',
                fontSize: 16, fontWeight: 600, flexShrink: 0,
              }}>{initials(contact.nom)}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.2 }}>{contact.nom}</div>
                {contact.societe && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>{contact.societe}</div>
                )}
              </div>
            </div>

            {contact.nbDemandesTotal > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{
                  padding: '10px 12px', background: 'var(--surface-sunken)',
                  borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 650, color: 'var(--ink-900)' }}>{contact.nbDemandesTotal}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>demandes</div>
                </div>
                <div style={{
                  padding: '10px 12px', background: 'var(--surface-sunken)',
                  borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                }}>
                  <div style={{
                    fontSize: 20, fontWeight: 650,
                    color: contact.nbDemandesConfirmees > 0 ? '#059669' : 'var(--ink-300)',
                  }}>{contact.nbDemandesConfirmees}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>confirmées</div>
                </div>
              </div>
            )}

            {contact.caTotalEstimeCents > 0 && (
              <div style={{
                padding: '10px 12px', background: '#F0FDF4',
                borderRadius: 'var(--r-sm)', border: '1px solid #BBF7D0',
              }}>
                <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 500 }}>CA estimé total</div>
                <div style={{ fontSize: 18, fontWeight: 650, color: '#166534', marginTop: 2 }}>
                  {formatCA(contact.caTotalEstimeCents)}
                </div>
              </div>
            )}
          </div>

          {/* Edit form */}
          <div>
            <div style={{
              fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--ink-400)', marginBottom: 12,
            }}>Coordonnées</div>
            <ContactEditForm
              contactId={contact.id}
              initialNom={contact.nom}
              initialEmail={contact.email}
              initialTelephone={contact.telephone}
              initialSociete={contact.societe}
              initialNotes={contact.notes}
            />
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 'auto' }}>
            Contact depuis le {formatDate(contact.createdAt)}
          </div>

          <div style={{
            paddingTop: 16, borderTop: '1px solid var(--hairline)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-400)' }}>
              Zone RGPD
            </div>
            <AnonymizeButton contactId={contact.id} alreadyAnonymized={!!contact.anonymizedAt} />
          </div>
        </div>

        {/* Right panel: demandes */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--ink-400)', marginBottom: 14,
          }}>
            Historique des demandes ({contact.demandes.length})
          </div>

          {contact.demandes.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '48px 16px',
              gap: 10, color: 'var(--ink-300)',
            }}>
              <Icon name="inbox" size={28} />
              <span style={{ fontSize: 13 }}>Aucune demande</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contact.demandes.map(d => (
              <Link key={d.id} href={`/demandes/${d.id}`} style={{
                textDecoration: 'none', color: 'inherit',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                padding: '12px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)', minWidth: 84 }}>
                  {d.reference}
                </span>

                {d.typeEvenement && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-600)' }}>
                    {EVENT_LABEL[d.typeEvenement] ?? d.typeEvenement}
                  </span>
                )}

                {d.dateEvenement && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-400)' }}>
                    <Icon name="cal" size={11} />
                    {formatDate(d.dateEvenement)}
                  </span>
                )}

                {d.nbInvites && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-400)' }}>
                    <Icon name="users" size={11} />
                    {d.nbInvites} pers.
                  </span>
                )}

                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-block', fontSize: 11.5, fontWeight: 500,
                    padding: '2px 8px', borderRadius: 10,
                    background: `${STATUT_COLOR[d.statut] ?? '#6B7280'}18`,
                    color: STATUT_COLOR[d.statut] ?? '#6B7280',
                  }}>
                    {STATUT_LABEL[d.statut] ?? d.statut}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>
                    {formatDate(d.createdAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
