'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/icon'

type Objectif = 'PROPOSITION' | 'RELANCE' | 'DEVIS' | 'CONFIRMATION' | 'REFUS' | 'AUTRE'

const OBJECTIF_LABEL: Record<Objectif, string> = {
  PROPOSITION: 'Proposition', RELANCE: 'Relance', DEVIS: 'Devis',
  CONFIRMATION: 'Confirmation', REFUS: 'Refus', AUTRE: 'Autre',
}
const OBJECTIFS = Object.keys(OBJECTIF_LABEL) as Objectif[]

interface Template {
  id: string
  nom: string
  objectif: Objectif
  subjectTemplate: string
  bodyTemplate: string
  actif: boolean
}

const EMPTY = { nom: '', objectif: 'PROPOSITION' as Objectif, subjectTemplate: '', bodyTemplate: '' }

export default function TemplatesClient({ templates: initial }: { templates: Template[] }) {
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

  function openEdit(t: Template) {
    setEditing(t.id)
    setForm({ nom: t.nom, objectif: t.objectif, subjectTemplate: t.subjectTemplate, bodyTemplate: t.bodyTemplate })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.nom || !form.bodyTemplate) return
    setSaving(true)
    if (editing) {
      await fetch(`/api/templates/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    } else {
      await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    }
    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  async function toggleActif(t: Template) {
    await fetch(`/api/templates/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: !t.actif }) })
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce modèle ?')) return
    await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'inherit',
    background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {initial.map(t => (
        <div key={t.id} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '14px 18px',
          opacity: t.actif ? 1 : 0.55,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t.nom}</span>
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'var(--surface-sunken)', color: 'var(--ink-500)' }}>
                  {OBJECTIF_LABEL[t.objectif]}
                </span>
                {!t.actif && <span style={{ fontSize: 11, color: 'var(--ink-400)', fontStyle: 'italic' }}>inactif</span>}
              </div>
              {t.subjectTemplate && (
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 3 }}>Objet : {t.subjectTemplate}</div>
              )}
              <div style={{
                fontSize: 12.5, color: 'var(--ink-600)', lineHeight: 1.5,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>{t.bodyTemplate}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggleActif(t)} style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 'var(--r-sm)',
                background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer',
              }}>{t.actif ? 'Désactiver' : 'Activer'}</button>
              <button onClick={() => openEdit(t)} style={{
                padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center',
                background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer',
              }}><Icon name="file" size={13} /></button>
              <button onClick={() => handleDelete(t.id)} style={{
                padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center',
                background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: '#DC2626', cursor: 'pointer',
              }}><Icon name="close" size={13} /></button>
            </div>
          </div>
        </div>
      ))}

      {initial.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-400)', fontSize: 13 }}>
          Aucun modèle de message
        </div>
      )}

      {showForm && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--accent)',
          borderRadius: 'var(--r-md)', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{editing ? 'Modifier le modèle' : 'Nouveau modèle'}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Réponse initiale" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Objectif</label>
              <select value={form.objectif} onChange={e => setForm(f => ({ ...f, objectif: e.target.value as Objectif }))} style={inputStyle}>
                {OBJECTIFS.map(o => <option key={o} value={o}>{OBJECTIF_LABEL[o]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Objet email</label>
            <input value={form.subjectTemplate} onChange={e => setForm(f => ({ ...f, subjectTemplate: e.target.value }))} placeholder="Suite à votre demande…" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Corps du message *</label>
            <textarea value={form.bodyTemplate} onChange={e => setForm(f => ({ ...f, bodyTemplate: e.target.value }))}
              placeholder={'Bonjour {{prenom}},\n\nMerci pour votre demande…'}
              rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{
              padding: '7px 14px', borderRadius: 'var(--r-sm)', fontSize: 13,
              background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer',
            }}>Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.nom || !form.bodyTemplate} style={{
              padding: '7px 16px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 500,
              background: saving || !form.nom || !form.bodyTemplate ? 'var(--border)' : 'var(--accent)',
              color: saving || !form.nom || !form.bodyTemplate ? 'var(--ink-400)' : '#fff',
              cursor: saving || !form.nom || !form.bodyTemplate ? 'not-allowed' : 'pointer',
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
          Ajouter un modèle
        </button>
      )}
    </div>
  )
}
