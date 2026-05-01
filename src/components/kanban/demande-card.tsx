'use client'

import Link from 'next/link'
import type { DemandeEnriched, StatutDemande } from '@/types/domain'
import Icon from '@/components/ui/icon'

const CHANNEL_ICON = { EMAIL: 'mail', FORMULAIRE: 'form', TELEPHONE: 'phone' } as const

// PR2 — couleur pastille = couleur de la colonne kanban du statut courant
// (cohérence visuelle, aucune nouvelle couleur introduite).
const UNREAD_DOT_COLOR: Record<StatutDemande, string> = {
  NOUVELLE:       '#6366F1',
  EN_COURS:       '#F59E0B',
  ATTENTE_CLIENT: '#9F1239',
  CONFIRMEE:      '#10B981',
  ANNULEE:        '#9CA3AF',
  PERDUE:         '#9F1239',
}

const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise", ANNIVERSAIRE: 'Anniversaire',
  SEMINAIRE: 'Séminaire', PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}

const TAG_COLOR: Record<string, { bg: string; color: string }> = {
  MARIAGE:          { bg: '#FDF2F4', color: '#6A0D27' },
  DINER_ENTREPRISE: { bg: '#EEF2FF', color: '#3730A3' },
  ANNIVERSAIRE:     { bg: '#FEF3C7', color: '#92400E' },
  SEMINAIRE:        { bg: '#F0FDF4', color: '#166534' },
  PRIVATISATION:    { bg: '#F5F3FF', color: '#5B21B6' },
  BAPTEME:          { bg: '#FFF7ED', color: '#9A3412' },
  COCKTAIL:         { bg: '#EEF2FF', color: '#3730A3' },
  AUTRE:            { bg: '#F1F5F9', color: '#475569' },
}

function formatDate(d: Date | string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d))
}

function initials(nom: string) {
  return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function agingDays(createdAt: Date | string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

interface Props {
  demande: DemandeEnriched
  focused?: boolean
  dense?: boolean
  onClick?: () => void
}

export default function DemandeCard({ demande, focused = false, dense = false, onClick }: Props) {
  const { contact, urgenceLevel, origine, typeEvenement, nbInvites, dateEvenement, conflitDetecte, createdAt, statut, hasUnread } = demande
  const days = agingDays(createdAt)
  const tagColor = typeEvenement ? (TAG_COLOR[typeEvenement] ?? TAG_COLOR.AUTRE) : null
  const avatarBg = contact.societe ? '#8B5CF6' : '#0EA5E9'
  const unreadDotColor = UNREAD_DOT_COLOR[statut] ?? '#9F1239'

  // PR2 — pastille "nouveau message" : point coloré à côté de l'icône.
  // PR3 : aria-hidden car le badge "NOUVEAU" ci-dessous porte l'a11y.
  const UnreadDot = hasUnread ? (
    <span
      aria-hidden="true"
      title="Nouveau message"
      style={{
        width: 7, height: 7, borderRadius: '50%',
        background: unreadDotColor, display: 'inline-block', flexShrink: 0,
        boxShadow: '0 0 0 1.5px var(--surface)',
      }}
    />
  ) : null

  // PR3 — badge "NOUVEAU" pill ambre, plus explicite que le dot, en haut à
  // gauche de la card. Animation pulse 2× au mount via classe globale
  // .unread-badge (cf. globals.css ; respecte prefers-reduced-motion).
  const UnreadBadge = hasUnread ? (
    <span
      role="status"
      aria-label="Nouveau message non lu"
      className="unread-badge"
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 6px',
        borderRadius: 999,
        fontSize: 9.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        background: '#F59E0B', color: '#fff',
        flexShrink: 0,
      }}
    >Nouveau</span>
  ) : null

  /* ── Dense variant ── */
  const denseContent = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {UnreadBadge}
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: avatarBg, color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: 9.5, fontWeight: 600, flexShrink: 0,
        }}>{initials(contact.nom)}</div>
        <div style={{ fontSize: 13, fontWeight: 550, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contact.nom}
        </div>
        {tagColor && typeEvenement && (
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '1px 6px',
            borderRadius: 4, background: tagColor.bg, color: tagColor.color, flexShrink: 0,
          }}>{EVENT_LABEL[typeEvenement] ?? typeEvenement}</span>
        )}
        {UnreadDot}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--ink-500)' }}>
        {nbInvites && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icon name="users" size={11} />{nbInvites}
          </span>
        )}
        {dateEvenement && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icon name="cal" size={11} />{formatDate(dateEvenement)}
          </span>
        )}
        <span style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3,
          color: urgenceLevel === 'hot' ? 'var(--accent)' : urgenceLevel === 'warn' ? '#D97706' : 'var(--ink-300)',
          fontWeight: urgenceLevel === 'hot' ? 600 : 400,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
            background: urgenceLevel === 'hot' ? 'var(--accent)' : urgenceLevel === 'warn' ? '#F59E0B' : '#D9D3C7',
          }} />
          {days === 0 ? 'Auj.' : `${days}j`}
        </span>
      </div>
    </>
  )

  const denseStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--r-md)',
    padding: '10px 12px',
    display: 'flex', flexDirection: 'column', gap: 5,
    cursor: 'pointer', textDecoration: 'none', color: 'inherit',
  }

  if (dense) {
    return onClick
      ? <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()} style={denseStyle}>{denseContent}</div>
      : <Link href={`/demandes/${demande.id}`} style={denseStyle}>{denseContent}</Link>
  }

  /* ── Classic variant ── */
  const classicContent = (
    <>
      {conflitDetecte && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 10, fontWeight: 600, color: '#fff',
          background: '#DC2626', borderRadius: 4, padding: '1px 5px',
        }}>Conflit</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {UnreadBadge}
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: avatarBg, color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: 10.5, fontWeight: 600, flexShrink: 0,
        }}>{initials(contact.nom)}</div>
        <div style={{
          fontSize: 13.5, fontWeight: 550, flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{contact.nom}</div>
        <span style={{ color: 'var(--ink-400)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name={CHANNEL_ICON[origine] ?? 'mail'} size={13} />
          {UnreadDot}
        </span>
      </div>

      {tagColor && typeEvenement && (
        <div>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 7px', borderRadius: 4,
            fontSize: 10.5, fontWeight: 500, letterSpacing: '0.01em',
            background: tagColor.bg, color: tagColor.color,
          }}>{EVENT_LABEL[typeEvenement] ?? typeEvenement}</span>
        </div>
      )}

      {(nbInvites || dateEvenement) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {nbInvites && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', background: 'var(--surface-sunken)',
              borderRadius: 10, fontSize: 11.5, color: 'var(--ink-700)',
            }}>
              <Icon name="users" size={11} />{nbInvites} pers.
            </span>
          )}
          {dateEvenement && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', background: 'var(--surface-sunken)',
              borderRadius: 10, fontSize: 11.5, color: 'var(--ink-700)',
            }}>
              <Icon name="cal" size={11} />{formatDate(dateEvenement)}
            </span>
          )}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 2, paddingTop: 8,
        borderTop: '1px dashed var(--hairline)',
        fontSize: 11.5, color: 'var(--ink-500)',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {contact.societe ?? 'Particulier'}
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          color: urgenceLevel === 'hot' ? 'var(--accent)' : urgenceLevel === 'warn' ? '#D97706' : 'var(--ink-400)',
          fontWeight: urgenceLevel === 'hot' ? 550 : 400,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
            background: urgenceLevel === 'hot' ? 'var(--accent)' : urgenceLevel === 'warn' ? '#F59E0B' : '#D9D3C7',
          }} />
          {days === 0 ? 'Auj.' : `${days}j`}
        </span>
      </div>
    </>
  )

  const classicStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
    boxShadow: focused ? '0 0 0 3px var(--accent-soft), var(--shadow-md)' : 'var(--shadow-sm)',
    borderRadius: 'var(--r-md)',
    padding: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
    cursor: 'pointer', transition: 'box-shadow .12s, border-color .12s',
    position: 'relative', textDecoration: 'none', color: 'inherit',
  }

  return onClick
    ? <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()} style={classicStyle}>{classicContent}</div>
    : <Link href={`/demandes/${demande.id}`} style={classicStyle}>{classicContent}</Link>
}
