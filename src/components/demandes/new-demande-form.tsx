'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TYPE_OPTIONS = [
  { value: '', label: "— Type d'événement —" },
  { value: 'MARIAGE', label: 'Mariage' },
  { value: 'DINER_ENTREPRISE', label: "Dîner d'entreprise" },
  { value: 'ANNIVERSAIRE', label: 'Anniversaire' },
  { value: 'SEMINAIRE', label: 'Séminaire' },
  { value: 'PRIVATISATION', label: 'Privatisation' },
  { value: 'BAPTEME', label: 'Baptême' },
  { value: 'COCKTAIL', label: 'Cocktail' },
  { value: 'AUTRE', label: 'Autre' },
]

interface Espace { id: string; nom: string; capaciteMax: number }
interface Props { espaces: Espace[] }

export default function NewDemandeForm({ espaces }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    contactNom: '', contactEmail: '', contactSociete: '', contactTelephone: '',
    typeEvenement: '', dateEvenement: '', heureDebut: '', heureFin: '',
    nbInvites: '', espaceId: '', notes: '',
  })

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.contactNom.trim() || !form.contactEmail.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/demandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactNom: form.contactNom,
        contactEmail: form.contactEmail,
        contactSociete: form.contactSociete || undefined,
        contactTelephone: form.contactTelephone || undefined,
        typeEvenement: form.typeEvenement || undefined,
        dateEvenement: form.dateEvenement || undefined,
        heureDebut: form.heureDebut || undefined,
        heureFin: form.heureFin || undefined,
        nbInvites: form.nbInvites ? Number(form.nbInvites) : undefined,
        espaceId: form.espaceId || undefined,
        notes: form.notes || undefined,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? 'Erreur lors de la création')
      setSaving(false)
      return
    }
    const data = await res.json() as { id: string }
    router.push(`/demandes/${data.id}`)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 11px',
    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
    fontSize: 13.5, fontFamily: 'inherit',
    background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: 'var(--ink-500)', display: 'block', marginBottom: 5,
  }
  const sectionHead: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--ink-400)', marginBottom: 14,
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 28 }}>

      <section>
        <div style={sectionHead}>Contact client</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
          <div>
            <label style={labelStyle}>Nom *</label>
            <input required value={form.contactNom} onChange={set('contactNom')} placeholder="Marie Dupont" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input required type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="marie@example.com" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Société</label>
            <input value={form.contactSociete} onChange={set('contactSociete')} placeholder="BNP Paribas" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Téléphone</label>
            <input type="tel" value={form.contactTelephone} onChange={set('contactTelephone')} placeholder="+33 6 12 34 56 78" style={inputStyle} />
          </div>
        </div>
      </section>

      <section>
        <div style={sectionHead}>Événement</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
          <div>
            <label style={labelStyle}>Type d'événement</label>
            <select value={form.typeEvenement} onChange={set('typeEvenement')} style={inputStyle}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={form.dateEvenement} onChange={set('dateEvenement')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Heure début</label>
            <input value={form.heureDebut} onChange={set('heureDebut')} placeholder="19h00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Heure fin</label>
            <input value={form.heureFin} onChange={set('heureFin')} placeholder="23h00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Nombre d'invités</label>
            <input type="number" min="1" value={form.nbInvites} onChange={set('nbInvites')} placeholder="40" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Espace souhaité</label>
            <select value={form.espaceId} onChange={set('espaceId')} style={inputStyle}>
              <option value="">— Aucun / À définir —</option>
              {espaces.map(e => (
                <option key={e.id} value={e.id}>{e.nom} (max {e.capaciteMax} pers.)</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <div style={sectionHead}>Notes internes</div>
        <textarea
          value={form.notes} onChange={set('notes')} rows={4}
          placeholder="Contraintes alimentaires, demandes spéciales, infos complémentaires…"
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
        />
      </section>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6, padding: '8px 12px', margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="submit"
          disabled={saving || !form.contactNom.trim() || !form.contactEmail.trim()}
          style={{
            padding: '9px 22px', borderRadius: 'var(--r-sm)',
            fontSize: 13.5, fontWeight: 500, border: 'none',
            background: saving || !form.contactNom.trim() || !form.contactEmail.trim() ? 'var(--border)' : 'var(--accent)',
            color: saving || !form.contactNom.trim() || !form.contactEmail.trim() ? 'var(--ink-400)' : '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >{saving ? 'Création…' : 'Créer la demande'}</button>
        <a href="/demandes" style={{ fontSize: 13, color: 'var(--ink-500)', textDecoration: 'none' }}>Annuler</a>
      </div>
    </form>
  )
}
