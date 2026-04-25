'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/icon'

interface Espace {
  id: string
  nom: string
  capaciteMin: number
  capaciteMax: number
  description: string | null
  actif: boolean
}

const EMPTY = { nom: '', capaciteMin: '1', capaciteMax: '', description: '' }

export default function EspacesClient({ espaces: initial }: { espaces: Espace[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)

  function openAdd() {
    setEditing(null)
    setForm(EMPTY)
    setShowForm(true)
  }

  function openEdit(e: Espace) {
    setEditing(e.id)
    setForm({ nom: e.nom, capaciteMin: String(e.capaciteMin), capaciteMax: String(e.capaciteMax), description: e.description ?? '' })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.nom || !form.capaciteMax) return
    setSaving(true)
    const payload = { nom: form.nom, capaciteMin: Number(form.capaciteMin), capaciteMax: Number(form.capaciteMax), description: form.description || null }
    if (editing) {
      await fetch(`/api/espaces/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/espaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  async function toggleActif(e: Espace) {
    await fetch(`/api/espaces/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: !e.actif }) })
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cet espace ?')) return
    await fetch(`/api/espaces/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'inherit',
    background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {initial.map(e => (
        <div key={e.id} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 16,
          opacity: e.actif ? 1 : 0.55,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: e.description ? 3 : 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{e.nom}</span>
              <span style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 10, background: 'var(--surface-sunken)', color: 'var(--ink-500)' }}>
                {e.capaciteMin}–{e.capaciteMax} pers.
              </span>
              {!e.actif && <span style={{ fontSize: 11, color: 'var(--ink-400)', fontStyle: 'italic' }}>inactif</span>}
            </div>
            {e.description && <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{e.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => toggleActif(e)} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 'var(--r-sm)',
              background: 'var(--surface-sunken)', border: '1px solid var(--border)',
              color: 'var(--ink-600)', cursor: 'pointer',
            }}>{e.actif ? 'Désactiver' : 'Activer'}</button>
            <button onClick={() => openEdit(e)} style={{
              padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center',
              background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer',
            }}><Icon name="file" size={13} /></button>
            <button onClick={() => handleDelete(e.id)} style={{
              padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center',
              background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: '#DC2626', cursor: 'pointer',
            }}><Icon name="close" size={13} /></button>
          </div>
        </div>
      ))}

      {initial.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-400)', fontSize: 13 }}>
          Aucun espace configuré
        </div>
      )}

      {showForm && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--accent)',
          borderRadius: 'var(--r-md)', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{editing ? "Modifier l'espace" : 'Nouvel espace'}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Salle principale" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Min pers.</label>
              <input type="number" value={form.capaciteMin} onChange={e => setForm(f => ({ ...f, capaciteMin: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Max pers. *</label>
              <input type="number" value={form.capaciteMax} onChange={e => setForm(f => ({ ...f, capaciteMax: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Vue sur jardin, écran de projection…" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{
              padding: '7px 14px', borderRadius: 'var(--r-sm)', fontSize: 13,
              background: 'var(--surface-sunken)', border: '1px solid var(--border)',
              color: 'var(--ink-600)', cursor: 'pointer',
            }}>Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.nom || !form.capaciteMax} style={{
              padding: '7px 16px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 500,
              background: saving || !form.nom || !form.capaciteMax ? 'var(--border)' : 'var(--accent)',
              color: saving || !form.nom || !form.capaciteMax ? 'var(--ink-400)' : '#fff',
              cursor: saving || !form.nom || !form.capaciteMax ? 'not-allowed' : 'pointer',
            }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      )}

      {!showForm && (
        <button onClick={openAdd} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', border: '1px dashed var(--border)',
          borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--ink-500)',
          background: 'transparent', cursor: 'pointer', alignSelf: 'flex-start',
        }}>
          <Icon name="plus" size={14} />
          Ajouter un espace
        </button>
      )}
    </div>
  )
}
