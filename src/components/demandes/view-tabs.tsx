'use client'

import Link from 'next/link'

type View = 'active' | 'archived' | 'trash'

interface Props {
  active: number
  archived: number
  trash: number
  current: View
}

const TABS: { value: View; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archivées' },
  { value: 'trash', label: 'Corbeille' },
]

export default function ViewTabs({ active, archived, trash, current }: Props) {
  const counts: Record<View, number> = { active, archived, trash }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      gap: 0,
      padding: '0 24px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--hairline)',
    }}>
      {TABS.map(t => {
        const isCurrent = t.value === current
        return (
          <Link
            key={t.value}
            href={`/demandes?view=${t.value}`}
            style={{
              padding: '12px 16px',
              fontSize: 13,
              color: isCurrent ? 'var(--ink)' : 'var(--ink-secondary)',
              textDecoration: 'none',
              borderBottom: isCurrent
                ? '2px solid var(--accent-color, #6366F1)'
                : '2px solid transparent',
              marginBottom: -1,
              fontWeight: isCurrent ? 550 : 400,
            }}
          >
            {t.label} ({counts[t.value]})
          </Link>
        )
      })}
    </div>
  )
}
