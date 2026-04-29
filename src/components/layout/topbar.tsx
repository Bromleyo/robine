import Icon from '@/components/ui/icon'
import Link from 'next/link'
import NotificationBell from '@/components/layout/notification-bell'

interface TopbarProps {
  title: string
  subtitle?: string
  primaryLabel?: string
  primaryHref?: string
  hidePrimary?: boolean
  children?: React.ReactNode
}

export default function Topbar({ title, subtitle, primaryLabel = 'Nouvelle demande', primaryHref = '/demandes/new', hidePrimary = false, children }: TopbarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 28px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      minHeight: 64,
    }}>
      <div>
        <h1 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', margin: 0 }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 1 }}>{subtitle}</div>}
      </div>

      {children}

      {/* Search */}
      <div style={{
        flex: '0 0 280px', marginLeft: 'auto',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px',
        background: 'var(--surface-sunken)',
        borderRadius: 'var(--r-sm)',
        fontSize: 13, color: 'var(--ink-500)',
      }}>
        <Icon name="search" size={14} />
        <span>Rechercher…</span>
        <kbd style={{
          marginLeft: 'auto', fontFamily: 'inherit',
          fontSize: 10, color: 'var(--ink-400)',
          background: 'var(--surface)', padding: '1px 5px',
          borderRadius: 3, border: '1px solid var(--border)',
        }}>⌘K</kbd>
      </div>

      {/* Bell */}
      <NotificationBell />

      {/* CTA */}
      {!hidePrimary && (
        <Link
          href={primaryHref}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 'var(--r-sm)',
            fontSize: 13, fontWeight: 500,
            background: 'var(--accent)', color: '#fff',
            textDecoration: 'none',
          }}
        >
          <Icon name="plus" size={14} stroke={2.2} />
          {primaryLabel}
        </Link>
      )}
    </div>
  )
}
