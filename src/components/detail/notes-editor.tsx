'use client'

import { useState } from 'react'

interface Props {
  demandeId: string
  initialNotes: string | null
}

export default function NotesEditor({ demandeId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleBlur() {
    setSaving(true)
    setSaved(false)
    await fetch(`/api/demandes/${demandeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes.trim() || null }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        value={notes}
        onChange={e => { setNotes(e.target.value); setSaved(false) }}
        onBlur={handleBlur}
        placeholder="Notes internes (non visibles par le client)…"
        rows={5}
        style={{
          width: '100%', resize: 'vertical',
          padding: '9px 11px',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          fontSize: 13, color: 'var(--ink-900)',
          fontFamily: 'inherit', lineHeight: 1.55,
          outline: 'none',
        }}
      />
      <div style={{ fontSize: 11, color: 'var(--ink-400)', minHeight: 16 }}>
        {saving && 'Sauvegarde…'}
        {saved && !saving && 'Sauvegardé'}
      </div>
    </div>
  )
}
