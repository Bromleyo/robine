'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Member { id: string; nom: string; avatarColor: string }

interface Props {
  demandeId: string
  assigneeId?: string | null
  assigneeName?: string | null
  assigneeColor?: string | null
}

function initials(nom: string) {
  return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function AssigneeSelector({ demandeId, assigneeId, assigneeName, assigneeColor }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [saving, setSaving] = useState(false)

  async function handleOpen() {
    if (!open && members.length === 0) {
      const res = await fetch('/api/membres')
      if (res.ok) setMembers(await res.json() as Member[])
    }
    setOpen(o => !o)
  }

  async function assign(id: string | null) {
    setOpen(false)
    setSaving(true)
    await fetch(`/api/demandes/${demandeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: id }),
    })
    setSaving(false)
    router.refresh()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => void handleOpen()}
        disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '5px 8px',
          background: 'none', border: '1px dashed var(--border)',
          borderRadius: 'var(--r-sm)', cursor: saving ? 'wait' : 'pointer',
          fontSize: 13, color: 'var(--ink-700)', textAlign: 'left',
        }}
      >
        {assigneeId && assigneeName ? (
          <>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: assigneeColor ?? '#9F1239',
              color: '#fff', display: 'grid', placeItems: 'center',
              fontSize: 10, fontWeight: 600, flexShrink: 0,
            }}>{initials(assigneeName)}</div>
            <span>{assigneeName}</span>
          </>
        ) : (
          <span style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>Non assigné</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
            minWidth: 200, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,.12)', overflow: 'hidden',
          }}>
            {members.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ink-400)' }}>Chargement…</div>
            )}
            {assigneeId && (
              <button
                onClick={() => void assign(null)}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px',
                  textAlign: 'left', background: 'none', border: 'none',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13, color: 'var(--ink-500)', cursor: 'pointer',
                }}
              >
                Retirer l'assignation
              </button>
            )}
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => void assign(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 12px',
                  background: m.id === assigneeId ? 'var(--surface-sunken)' : 'none',
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, color: 'var(--ink-800)',
                }}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: m.avatarColor, color: '#fff',
                  display: 'grid', placeItems: 'center',
                  fontSize: 10, fontWeight: 600, flexShrink: 0,
                }}>{initials(m.nom)}</div>
                {m.nom}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
