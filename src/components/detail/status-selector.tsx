'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StatutDemande } from '@/types/domain'

const STATUTS: { value: StatutDemande; label: string; color: string }[] = [
  { value: 'NOUVELLE', label: 'Nouvelle', color: '#6366F1' },
  { value: 'EN_COURS', label: 'En cours', color: '#D97706' },
  { value: 'ATTENTE_CLIENT', label: 'Attente client', color: '#DC2626' },
  { value: 'CONFIRMEE', label: 'Confirmée', color: '#059669' },
  { value: 'ANNULEE', label: 'Annulée', color: '#6B7280' },
  { value: 'PERDUE', label: 'Perdue', color: '#9F1239' },
]

interface Props {
  demandeId: string
  currentStatut: StatutDemande
}

export default function StatusSelector({ demandeId, currentStatut }: Props) {
  const router = useRouter()
  const [statut, setStatut] = useState(currentStatut)
  const [loading, setLoading] = useState(false)

  const current = STATUTS.find(s => s.value === statut) ?? STATUTS[0]!

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as StatutDemande
    setStatut(next)
    setLoading(true)
    await fetch(`/api/demandes/${demandeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: next }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span style={{
        position: 'absolute', left: 10, width: 7, height: 7, borderRadius: '50%',
        background: current.color, pointerEvents: 'none',
      }} />
      <select
        value={statut}
        onChange={handleChange}
        disabled={loading}
        style={{
          appearance: 'none',
          paddingLeft: 24, paddingRight: 28, paddingTop: 6, paddingBottom: 6,
          background: `${current.color}18`,
          color: current.color,
          border: `1px solid ${current.color}50`,
          borderRadius: 'var(--r-sm)',
          fontSize: 13, fontWeight: 550,
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {STATUTS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <span style={{
        position: 'absolute', right: 8, pointerEvents: 'none',
        color: current.color, fontSize: 10,
      }}>▾</span>
    </div>
  )
}
