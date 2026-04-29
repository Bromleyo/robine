'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  demandeId: string
  from: 'archive' | 'trash'
}

export default function RestoreButton({ demandeId, from }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/demandes/${demandeId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from }),
      })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      style={{
        border: '1px solid var(--hairline)',
        background: 'transparent',
        padding: '4px 10px',
        fontSize: 12,
        borderRadius: 'var(--r-sm)',
        color: 'var(--ink-700)',
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      Restaurer
    </button>
  )
}
