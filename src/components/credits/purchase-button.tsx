'use client'

import { useState } from 'react'

export default function PurchaseButton() {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePurchase() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ai-credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'achat")
        return
      }
      setDone(true)
      window.location.reload()
    } catch {
      setError('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        onClick={handlePurchase}
        disabled={loading || done}
        style={{
          padding: '8px 16px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 13, fontWeight: 500,
          border: 'none', cursor: loading || done ? 'not-allowed' : 'pointer',
          opacity: loading || done ? 0.6 : 1,
        }}
      >
        {loading ? 'En cours…' : done ? 'Ajouté !' : 'Acheter 1 crédit'}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--error-ink, #991b1b)' }}>{error}</span>}
    </div>
  )
}
