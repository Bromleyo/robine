'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * PR2 — Bouton "Marquer comme traité" sur la fiche demande.
 * Visible uniquement quand hasUnread=true (le parent gère l'affichage).
 * Met à jour Demande.lastSeenByAssigneeAt = NOW() côté serveur, sans
 * toucher au statut, puis refresh la page.
 */
interface Props {
  demandeId: string
}

export default function MarkReadButton({ demandeId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/demandes/${demandeId}/mark-read`, { method: 'POST' })
      if (!res.ok) {
        console.error('[mark-read] failed', res.status)
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 500,
        padding: '5px 10px', borderRadius: 'var(--r-sm)',
        border: '1px solid var(--border)',
        background: loading ? 'var(--surface-sunken)' : 'var(--surface)',
        color: 'var(--ink-700)',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'background .12s',
      }}
      title="Marque cette demande comme lue, sans modifier le statut"
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9F1239', display: 'inline-block' }} />
      {loading ? 'Mise à jour…' : 'Marquer comme traité'}
    </button>
  )
}
