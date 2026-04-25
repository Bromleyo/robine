'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  contactId: string
  alreadyAnonymized: boolean
}

export default function AnonymizeButton({ contactId, alreadyAnonymized }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAnonymize() {
    if (!confirm("Anonymiser ce contact ? Cette action est irréversible : le nom, l'email, le téléphone et les notes seront effacés.")) return
    setLoading(true)
    setError('')
    const res = await fetch(`/api/contacts/${contactId}/anonymize`, { method: 'POST' })
    if (res.ok || res.status === 204) {
      router.push('/contacts')
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? 'Erreur')
      setLoading(false)
    }
  }

  if (alreadyAnonymized) {
    return (
      <div style={{ fontSize: 12, color: 'var(--ink-400)', fontStyle: 'italic' }}>
        Contact anonymisé
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={() => void handleAnonymize()}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', fontSize: 12.5, fontWeight: 500,
          border: '1px solid #FCA5A5',
          borderRadius: 'var(--r-sm)',
          background: '#FFF5F5', color: '#DC2626',
          cursor: loading ? 'not-allowed' : 'pointer',
          width: 'fit-content',
        }}
      >
        {loading ? 'Anonymisation…' : 'Anonymiser ce contact (RGPD)'}
      </button>
      {error && <p style={{ fontSize: 11.5, color: '#DC2626', margin: 0 }}>{error}</p>}
    </div>
  )
}
