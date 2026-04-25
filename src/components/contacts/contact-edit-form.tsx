'use client'

import { useState } from 'react'
import Icon from '@/components/ui/icon'

type IconName = React.ComponentProps<typeof Icon>['name']

interface Props {
  contactId: string
  initialNom: string
  initialEmail: string
  initialTelephone?: string | null
  initialSociete?: string | null
  initialNotes?: string | null
}

function MetaRow({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--ink-700)' }}>
      <span style={{ color: 'var(--ink-400)', marginTop: 1, flexShrink: 0 }}>
        <Icon name={icon} size={14} />
      </span>
      <span style={{ lineHeight: 1.45 }}>{children}</span>
    </div>
  )
}

export default function ContactEditForm({
  contactId, initialNom, initialEmail,
  initialTelephone, initialSociete, initialNotes,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [nom, setNom] = useState(initialNom)
  const [telephone, setTelephone] = useState(initialTelephone ?? '')
  const [societe, setSociete] = useState(initialSociete ?? '')
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom,
          telephone: telephone.trim() || null,
          societe: societe.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setEditing(false)
    setNom(initialNom)
    setTelephone(initialTelephone ?? '')
    setSociete(initialSociete ?? '')
    setNotes(initialNotes ?? '')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', boxSizing: 'border-box',
    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
    fontSize: 13, color: 'var(--ink-900)',
    background: 'var(--surface)', outline: 'none', fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--ink-400)',
    display: 'block', marginBottom: 4,
  }

  if (!editing) {
    return (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <MetaRow icon="mail">{initialEmail}</MetaRow>
          {(telephone || initialTelephone) && (
            <MetaRow icon="phone">{telephone || initialTelephone}</MetaRow>
          )}
          {(societe || initialSociete) && (
            <MetaRow icon="pin">{societe || initialSociete}</MetaRow>
          )}
          {(notes || initialNotes) && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)', fontStyle: 'italic', marginTop: 2, lineHeight: 1.5 }}>
              {notes || initialNotes}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setEditing(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, color: 'var(--ink-500)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 0',
            }}
          >
            <Icon name="gear" size={12} /> Modifier
          </button>
          {saved && <span style={{ fontSize: 11.5, color: '#059669' }}>Enregistré ✓</span>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={labelStyle}>NOM</label>
        <input value={nom} onChange={e => setNom(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>TÉLÉPHONE</label>
        <input value={telephone} onChange={e => setTelephone(e.target.value)} style={inputStyle} placeholder="Non renseigné" />
      </div>
      <div>
        <label style={labelStyle}>SOCIÉTÉ</label>
        <input value={societe} onChange={e => setSociete(e.target.value)} style={inputStyle} placeholder="Non renseigné" />
      </div>
      <div>
        <label style={labelStyle}>NOTES</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Notes internes…"
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '7px 16px', borderRadius: 'var(--r-sm)',
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 500, border: 'none',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={handleCancel}
          style={{
            padding: '7px 12px', borderRadius: 'var(--r-sm)',
            background: 'var(--surface-sunken)', color: 'var(--ink-700)',
            fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
