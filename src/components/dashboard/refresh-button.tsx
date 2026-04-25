'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshButton() {
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState<string | null>(null)
  const router = useRouter()

  async function handleRefresh() {
    setLoading(true)
    setLabel(null)
    try {
      const res = await fetch('/api/mailboxes/poll', { method: 'POST' })
      const data = await res.json() as { processed?: number }
      setLabel(data.processed === 0 ? 'À jour' : `+${data.processed}`)
      router.refresh()
    } catch {
      setLabel('Erreur')
    } finally {
      setLoading(false)
      setTimeout(() => setLabel(null), 3000)
    }
  }

  return (
    <button
      onClick={() => void handleRefresh()}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 'var(--r-sm)',
        fontSize: 12.5, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
        border: '1px solid var(--border)',
        background: 'var(--surface-sunken)',
        color: 'var(--ink-600)',
        flexShrink: 0,
      }}
    >
      <svg
        width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </svg>
      {loading ? 'Actualisation…' : label ?? 'Actualiser'}
    </button>
  )
}
