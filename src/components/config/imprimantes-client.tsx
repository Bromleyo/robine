'use client'

import { useEffect, useState } from 'react'

interface Imprimante {
  id: string
  nom: string
  adresseIp: string | null
  modele: string | null
  notes: string | null
  actif: boolean
  createdAt: string
}

export default function ImprimantesClient() {
  const [imprimantes, setImprimantes] = useState<Imprimante[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nom: '', adresseIp: '', modele: 'Epson TM-T30II-NT', notes: '' })
  const [error, setError] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/imprimantes')
      const data = await res.json() as Imprimante[]
      setImprimantes(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nom.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/imprimantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: form.nom.trim(),
          adresseIp: form.adresseIp.trim() || undefined,
          modele: form.modele.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })
      if (!res.ok) { setError("Erreur lors de l'ajout."); return }
      setForm({ nom: '', adresseIp: '', modele: 'Epson TM-T30II-NT', notes: '' })
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/imprimantes/${id}`, { method: 'DELETE' })
      setImprimantes(prev => prev.filter(p => p.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)', padding: '16px 20px',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--ink-400)', marginBottom: 4,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13.5,
    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
    background: 'var(--surface)', color: 'var(--ink-900)', outline: 'none',
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>

      {/* Info banner */}
      <div style={{
        background: 'var(--surface-sunken)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)', padding: '14px 18px',
        fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6, marginBottom: 28,
      }}>
        <strong style={{ color: 'var(--ink-800)' }}>Comment imprimer un ticket cuisine ?</strong>
        <br />
        Depuis la fiche d&apos;une demande <strong>Confirmée</strong>, cliquez sur{' '}
        <strong>Ticket cuisine</strong>. La boîte d&apos;impression s&apos;ouvre — sélectionnez votre
        Epson dans la liste, réglez le format sur <strong>80 mm</strong> (ou sans marges), puis imprimez.
        Enregistrez ici vos imprimantes pour retrouver leur adresse IP si besoin.
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--ink-400)', fontSize: 13 }}>Chargement…</div>
      ) : imprimantes.length === 0 && !showForm ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          color: 'var(--ink-400)', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 'var(--r-md)',
          marginBottom: 16,
        }}>
          Aucune imprimante enregistrée
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {imprimantes.map(p => (
            <div key={p.id} style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink-900)' }}>{p.nom}</div>
                {p.modele && <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{p.modele}</div>}
                {p.adresseIp && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-500)', fontFamily: 'monospace' }}>
                    {p.adresseIp}
                  </div>
                )}
                {p.notes && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>{p.notes}</div>}
              </div>
              <button
                onClick={() => void handleDelete(p.id)}
                disabled={deleting === p.id}
                style={{
                  flexShrink: 0, padding: '5px 10px', fontSize: 12.5,
                  border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                  background: 'var(--surface)', color: 'var(--ink-500)',
                  cursor: deleting === p.id ? 'not-allowed' : 'pointer',
                }}
              >
                {deleting === p.id ? '…' : 'Supprimer'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <form onSubmit={(e) => void handleAdd(e)} style={{
          border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          padding: '20px', background: 'var(--surface)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>Ajouter une imprimante</div>

          <div>
            <div style={labelStyle}>Nom *</div>
            <input
              style={inputStyle} required placeholder="Ex : Cuisine principale"
              value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Modèle</div>
              <input
                style={inputStyle} placeholder="Epson TM-T30II-NT"
                value={form.modele} onChange={e => setForm(f => ({ ...f, modele: e.target.value }))}
              />
            </div>
            <div>
              <div style={labelStyle}>Adresse IP</div>
              <input
                style={inputStyle} placeholder="192.168.1.100"
                value={form.adresseIp} onChange={e => setForm(f => ({ ...f, adresseIp: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <div style={labelStyle}>Notes</div>
            <input
              style={inputStyle} placeholder="Ex : Côté passe, cuisine froide…"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--accent)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit" disabled={saving}
              style={{
                padding: '8px 16px', fontSize: 13.5, fontWeight: 500,
                background: 'var(--ink-900)', color: '#fff',
                border: 'none', borderRadius: 'var(--r-sm)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button" onClick={() => { setShowForm(false); setError('') }}
              style={{
                padding: '8px 16px', fontSize: 13.5,
                background: 'transparent', color: 'var(--ink-600)',
                border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
              }}
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', fontSize: 13.5, fontWeight: 500,
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            background: 'var(--surface)', color: 'var(--ink-700)', cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Ajouter une imprimante
        </button>
      )}
    </div>
  )
}
