'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function CreditBadge() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/admin/ai-credits')
      .then(r => r.ok ? r.json() : null)
      .then((d: { balance: number } | null) => {
        if (d?.balance != null) setBalance(d.balance)
      })
      .catch(() => null)
  }, [])

  if (balance === null) return null

  const low = balance === 0

  return (
    <Link
      href="/credits"
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 10px', borderRadius: 'var(--r-sm)',
        fontSize: 12, fontWeight: 500,
        color: low ? 'var(--warning-ink, #92400e)' : 'var(--ink-500)',
        background: low ? 'var(--warning-soft, #fef9c3)' : 'var(--surface-sunken)',
        border: `1px solid ${low ? 'var(--warning-border, #fde68a)' : 'var(--border)'}`,
        textDecoration: 'none',
        transition: 'opacity .1s',
      }}
    >
      <span style={{ fontSize: 13 }}>⚡</span>
      <span>{balance} crédit{balance !== 1 ? 's' : ''} IA</span>
    </Link>
  )
}
