'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/icon'

interface Menu {
  id: string
  nom: string
  prixCents: number
  description: string | null
  minConvives: number | null
  maxConvives: number | null
  actif: boolean
}

const EMPTY = { nom: '', prixCents: '', description: '', minConvives: '', maxConvives: '' }

function formatPrix(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function MenusClient({ menus: initial }: { menus: Menu[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)

  function openAdd() { setEditing(null); setForm(EMPTY); setShowForm(true) }

  function openEdit(m: Menu) {
    setEditing(m.id)
    setForm({ nom: m.nom, prixCents: String(m.prixCents / 100), description: m.description ?? '', minConvives: m.minConvives ? String(m.minConvives) : '', maxConvives: m.maxConvives ? String(m.maxConvives) : '' })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.nom || !form.prixCents) return
    setSaving(true)
    const payload = { nom: form.nom, prixCents: Math.round(Number(form.prixCents) * 100), description: form.description || null, minConvives: form.minConvives ? Number(form.minConvives) : null, maxConvives: form.maxConvives ? Number(form.maxConvives) : null }
    if (editing) {
      await fetch(`/api/menus/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false); setShowForm(false); router.refresh()
  }

  async function toggleActif(m: Menu) {
    await fetch(`/api/menus/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: !m.actif }) })
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce menu ?')) return
    await fetch(`/api/menus/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'inherit',
    background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {initial.map(m => (
        <div key={m.id} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 16, opacity: m.actif ? 1 : 0.55,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: m.description ? 3 : 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nom}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>{formatPrix(m.prixCents)}</span>
              {(m.minConvives || m.maxConvives) && (
                <span style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 10, background: 'var(--surface-sunken)', color: 'var(--ink-500)' }}>
                  {m.minConvives ?? 1}–{m.maxConvives ?? '∞'} pers.
                </span>
              )}
              {!m.actif && <span style={{ fontSize: 11, color: 'var(--ink-400)', fontStyle: 'italic' }}>inactif</span>}
            </div>
            {m.description && <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{m.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => toggleActif(m)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer' }}>{m.actif ? 'Désactiver' : 'Activer'}</button>
            <button onClick={() => openEdit(m)} style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer' }}><Icon name="file" size={13} /></button>
            <button onClick={() => handleDelete(m.id)} style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: '#DC2626', cursor: 'pointer' }}><Icon name="close" size={13} /></button>
          </div>
        </div>
      ))}

      {initial.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-400)', fontSize: 13 }}>Aucun menu configuré</div>
      )}

      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r-md)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{editing ? 'Modifier le menu' : 'Nouveau menu'}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Menu prestige" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Prix / pers. (€) *</label>
              <input type="number" value={form.prixCents} onChange={e => setForm(f => ({ ...f, prixCents: e.target.value }))} placeholder="85" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Min convives</label>
              <input type="number" value={form.minConvives} onChange={e => setForm(f => ({ ...f, minConvives: e.target.value }))} placeholder="10" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Max convives</label>
              <input type="number" value={form.maxConvives} onChange={e => setForm(f => ({ ...f, maxConvives: e.target.value }))} placeholder="120" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mise en bouche, entrée, plat, dessert…" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '7px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.nom || !form.prixCents} style={{ padding: '7px 16px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 500, background: saving || !form.nom || !form.prixCents ? 'var(--border)' : 'var(--accent)', color: saving || !form.nom || !form.prixCents ? 'var(--ink-400)' : '#fff', cursor: saving || !form.nom || !form.prixCents ? 'not-allowed' : 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      )}

      {!showForm && (
        <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--ink-500)', background: 'transparent', cursor: 'pointer', alignSelf: 'flex-start' }}>
          <Icon name="plus" size={14} />
          Ajouter un menu
        </button>
      )}
    </div>
  )
}
