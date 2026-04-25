'use client'

import { useState } from 'react'

interface Props {
  initial: { nom: string; adresse: string | null; emailGroupes: string; timezone: string }
}

export default function RestaurantForm({ initial }: Props) {
  const [form, setForm] = useState({
    nom: initial.nom,
    adresse: initial.adresse ?? '',
    emailGroupes: initial.emailGroupes,
    timezone: initial.timezone,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!form.nom) return
    setSaving(true)
    setSaved(false)
    await fetch('/api/restaurant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, adresse: form.adresse || null }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 11px', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', fontSize: 13.5, fontFamily: 'inherit',
    background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: 'var(--ink-500)', display: 'block', marginBottom: 5,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 560 }}>
      <div>
        <label style={labelStyle}>Nom du restaurant *</label>
        <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Adresse</label>
        <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="12 rue de la Paix, 75001 Paris" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Email groupes / événements</label>
        <input value={form.emailGroupes} onChange={e => setForm(f => ({ ...f, emailGroupes: e.target.value }))} placeholder="groupes@lerestaurant.fr" style={inputStyle} />
        <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 4 }}>
          Adresse email surveillée pour les demandes entrantes
        </div>
      </div>
      <div>
        <label style={labelStyle}>Fuseau horaire</label>
        <select value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} style={inputStyle}>
          <option value="Europe/Paris">Europe/Paris (UTC+1/+2)</option>
          <option value="Europe/London">Europe/London (UTC+0/+1)</option>
          <option value="Europe/Brussels">Europe/Brussels (UTC+1/+2)</option>
          <option value="America/New_York">America/New_York (UTC-5/-4)</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleSave} disabled={saving || !form.nom} style={{
          padding: '8px 20px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 500,
          background: saving || !form.nom ? 'var(--border)' : 'var(--accent)',
          color: saving || !form.nom ? 'var(--ink-400)' : '#fff',
          cursor: saving || !form.nom ? 'not-allowed' : 'pointer',
        }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        {saved && <span style={{ fontSize: 12, color: '#059669' }}>Enregistré</span>}
      </div>
    </div>
  )
}
