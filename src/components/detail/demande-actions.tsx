'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ArchiveModal from '@/components/detail/archive-modal'

interface Props {
  demandeId: string
  fromEmail: string | null
  fromDomain: string | null
}

const BUTTON_BASE: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 13,
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--ink-600)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1.2,
  transition: 'background 120ms',
}

export default function DemandeActions({ demandeId, fromEmail, fromDomain }: Props) {
  const router = useRouter()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (deleting) return
    const ok = window.confirm(
      'Supprimer cette demande ? (vous pourrez la restaurer depuis la Corbeille)'
    )
    if (!ok) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/demandes/${demandeId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        setDeleting(false)
        window.alert('Échec de la suppression. Réessayez.')
      }
    } catch {
      setDeleting(false)
      window.alert('Erreur réseau. Réessayez.')
    }
  }

  function handleArchived() {
    setArchiveOpen(false)
    router.refresh()
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <button
          type="button"
          onClick={() => setArchiveOpen(true)}
          disabled={deleting}
          style={{
            ...BUTTON_BASE,
            color: 'var(--ink-500)',
            opacity: deleting ? 0.5 : 1,
            cursor: deleting ? 'wait' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!deleting) e.currentTarget.style.background = '#f9fafb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#fff'
          }}
        >
          Pas une demande
        </button>

        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          style={{
            ...BUTTON_BASE,
            opacity: deleting ? 0.5 : 1,
            cursor: deleting ? 'wait' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!deleting) e.currentTarget.style.background = '#f9fafb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#fff'
          }}
        >
          {deleting ? 'Suppression…' : 'Supprimer'}
        </button>
      </div>

      <ArchiveModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        demandeId={demandeId}
        fromEmail={fromEmail}
        fromDomain={fromDomain}
        onArchived={handleArchived}
      />
    </>
  )
}
