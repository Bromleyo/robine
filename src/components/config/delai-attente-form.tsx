'use client'

import { useState } from 'react'

interface Props {
  initialDelai: number
}

export default function DelaiAttenteForm({ initialDelai }: Props) {
  const [delai, setDelai] = useState<string>(String(initialDelai))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  async function save() {
    setFeedback(null)
    const n = Number(delai)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 90) {
      setFeedback({ type: 'err', msg: 'Doit être un entier entre 1 et 90.' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/delai-attente-client', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delaiJours: n }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setFeedback({ type: 'err', msg: err.error ?? 'Échec de sauvegarde' })
      } else {
        setFeedback({ type: 'ok', msg: 'Délai sauvegardé.' })
        setTimeout(() => setFeedback(null), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{
      padding: '20px 22px', marginBottom: 24,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
    }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--ink-900)',
        marginBottom: 4,
      }}>Gestion des demandes</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 14, lineHeight: 1.5 }}>
        Bascule automatique d'une demande de <strong>En cours</strong> vers <strong>Attente client</strong>{' '}
        après ce nombre de jours sans réponse client.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>Délai</label>
        <input
          type="number"
          min={1}
          max={90}
          value={delai}
          onChange={e => { setDelai(e.target.value); setFeedback(null) }}
          disabled={saving}
          style={{
            width: 80, padding: '6px 10px',
            fontSize: 13, fontFamily: 'inherit',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface-sunken)',
            color: 'var(--ink-900)', outline: 'none',
          }}
        />
        <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>jours (1-90)</span>
        <button
          onClick={() => void save()}
          disabled={saving || delai === String(initialDelai)}
          style={{
            padding: '6px 14px', fontSize: 13, fontWeight: 500,
            background: saving || delai === String(initialDelai) ? 'var(--surface-sunken)' : 'var(--accent)',
            color: saving || delai === String(initialDelai) ? 'var(--ink-400)' : '#fff',
            border: 'none', borderRadius: 'var(--r-sm)',
            cursor: saving ? 'wait' : (delai === String(initialDelai) ? 'default' : 'pointer'),
          }}
        >{saving ? 'Sauvegarde…' : 'Enregistrer'}</button>
        {feedback && (
          <span style={{
            fontSize: 12, color: feedback.type === 'ok' ? '#059669' : '#9F1239',
          }}>{feedback.msg}</span>
        )}
      </div>
    </section>
  )
}
