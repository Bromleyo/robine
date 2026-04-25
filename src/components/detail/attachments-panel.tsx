'use client'

import { useRef, useState } from 'react'
import Icon from '@/components/ui/icon'

interface Piece {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  storageUrl: string
  createdAt: Date | string
}

interface Props {
  demandeId: string
  initialPieces: Piece[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function AttachmentsPanel({ demandeId, initialPieces }: Props) {
  const [pieces, setPieces] = useState<Piece[]>(initialPieces)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/demandes/${demandeId}/attachments`, { method: 'POST', body: fd })
    if (res.ok) {
      const piece = await res.json() as Piece
      setPieces(prev => [...prev, piece])
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? 'Erreur upload')
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/demandes/${demandeId}/attachments/${id}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      setPieces(prev => prev.filter(p => p.id !== id))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {pieces.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink-300)', fontStyle: 'italic' }}>Aucun fichier</div>
      )}

      {pieces.map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 8px',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          fontSize: 12,
        }}>
          <Icon name="file" size={13} />
          <a
            href={p.storageUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, color: 'var(--ink-800)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {p.filename}
          </a>
          <span style={{ color: 'var(--ink-400)', flexShrink: 0 }}>{formatBytes(p.sizeBytes)}</span>
          <button
            onClick={() => void handleDelete(p.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-400)', padding: 2, display: 'flex', alignItems: 'center',
            }}
            title="Supprimer"
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}

      {error && (
        <p style={{ fontSize: 11.5, color: 'var(--accent)', margin: 0 }}>{error}</p>
      )}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', fontSize: 12, fontWeight: 500,
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--r-sm)',
          background: 'transparent', color: 'var(--ink-500)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          width: 'fit-content',
        }}
      >
        <Icon name="plus" size={12} />
        {uploading ? 'Envoi…' : 'Ajouter un fichier'}
      </button>

      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />
    </div>
  )
}
