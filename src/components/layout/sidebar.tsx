'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Icon from '@/components/ui/icon'

const NAV = [
  {
    group: 'Pilotage',
    items: [
      { id: 'dashboard', href: '/dashboard', label: 'Tableau de bord', icon: 'grid' as const },
      { id: 'demandes', href: '/demandes', label: 'Demandes', icon: 'inbox' as const },
      { id: 'calendar', href: '/calendar', label: 'Calendrier', icon: 'cal' as const },
      { id: 'contacts', href: '/contacts', label: 'Contacts', icon: 'users' as const },
      { id: 'analytics', href: '/analytics', label: 'Analytique', icon: 'chart' as const },
    ],
  },
  {
    group: 'Contenu',
    items: [
      { id: 'espaces', href: '/config/espaces', label: 'Espaces', icon: 'pin' as const },
      { id: 'menus', href: '/config/menus', label: 'Menus', icon: 'menu' as const },
      { id: 'templates', href: '/config/templates', label: 'Modèles', icon: 'file' as const },
      { id: 'mailboxes', href: '/config/mailboxes', label: 'Boîtes mail', icon: 'mail' as const },
      { id: 'emails-rejetes', href: '/config/emails-rejetes', label: 'Emails rejetés', icon: 'inbox' as const },
      { id: 'regles-ia', href: '/config/regles-ia', label: 'Règles IA', icon: 'sparkle' as const },
      { id: 'ia-personnalisee', href: '/config/ia-personnalisee', label: 'IA personnalisée', icon: 'sparkle' as const },
      { id: 'imprimantes', href: '/config/imprimantes', label: 'Imprimantes', icon: 'print' as const },
    ],
  },
  {
    group: '',
    items: [
      { id: 'settings', href: '/config/restaurant', label: 'Paramètres', icon: 'gear' as const },
    ],
  },
]

interface SidebarProps {
  restaurantNom?: string
  userName?: string
  userInitials?: string
  userRole?: string
  demandeCount?: number
}

export default function Sidebar({ restaurantNom = 'Robin', userName, userInitials = '?', userRole, demandeCount }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      style={{
        width: 224,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 12px',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Brand */}
      <Link href="/dashboard" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '6px 10px 22px', textDecoration: 'none' }}>
        <Image src="/robine-logo-petit.png" alt="Robine" width={36} height={36} style={{ objectFit: 'contain' }} />
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-500)', lineHeight: 1.3 }}>
          <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', display: 'block' }}>Établissement</span>
          {restaurantNom}
        </div>
      </Link>

      {/* Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.group && (
              <div style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--ink-400)', padding: '16px 10px 6px', fontWeight: 500,
              }}>{group.group}</div>
            )}
            {group.items.map(item => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 'var(--r-sm)',
                    fontSize: 13.5, color: isActive ? 'var(--accent-ink)' : 'var(--ink-700)',
                    fontWeight: isActive ? 550 : 450,
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'background .1s',
                  }}
                >
                  <Icon name={item.icon} size={16} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.id === 'demandes' && demandeCount != null && demandeCount > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, lineHeight: 1,
                      background: isActive ? 'var(--accent)' : 'var(--surface-sunken)',
                      color: isActive ? '#fff' : 'var(--ink-500)',
                      border: '1px solid var(--border)',
                      padding: '2px 6px', borderRadius: 10, flexShrink: 0,
                    }}>{demandeCount}</span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 10, borderTop: '1px solid var(--hairline)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: '#E8DFD2', color: 'var(--ink-700)',
          display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}>{userInitials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userName ?? 'Utilisateur'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{userRole ?? ''}</div>
        </div>
      </div>
    </aside>
  )
}
