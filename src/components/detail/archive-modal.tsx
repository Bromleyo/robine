'use client'

import { useState, useEffect } from 'react'

interface ArchiveModalProps {
  isOpen: boolean
  onClose: () => void
  demandeId: string
  fromEmail: string | null
  fromDomain: string | null
  onArchived?: () => void
}

type BlacklistTarget = 'sender' | 'domain' | 'none'

export default function ArchiveModal(props: ArchiveModalProps): React.ReactElement | null {
  const { isOpen, onClose, demandeId, fromEmail, fromDomain, onArchived } = props

  const [target, setTarget] = useState<BlacklistTarget>(fromEmail ? 'sender' : 'none')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset internal state on open
  useEffect(() => {
    if (isOpen) {
      setTarget(fromEmail ? 'sender' : 'none')
      setError(null)
      setLoading(false)
    }
  }, [isOpen, fromEmail])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleArchive() {
    setLoading(true)
    setError(null)

    let body: Record<string, unknown> = {}
    if (target === 'sender' && fromEmail) {
      body = { addToBlacklist: { type: 'sender', value: fromEmail } }
    } else if (target === 'domain' && fromDomain) {
      body = { addToBlacklist: { type: 'domain', value: fromDomain } }
    }

    try {
      const res = await fetch(`/api/demandes/${demandeId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? "Erreur lors de l'archivage")
        setLoading(false)
        return
      }

      onArchived?.()
      onClose()
    } catch {
      setError('Erreur réseau, veuillez réessayer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-modal-title"
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-md, 12px)',
          padding: 24,
          maxWidth: 480,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h2
          id="archive-modal-title"
          style={{
            fontFamily: 'var(--font-serif, inherit)',
            fontSize: 20,
            fontWeight: 600,
            marginTop: 0,
            marginBottom: 8,
          }}
        >
          Archiver cette demande
        </h2>
        <p
          style={{
            color: 'var(--ink-secondary)',
            fontSize: 14,
            marginTop: 0,
            marginBottom: 20,
          }}
        >
          Cette demande sera retirée de la liste active et sa source sera marquée comme rejetée.
        </p>

        {fromEmail ? (
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              Pour ne plus recevoir de mails de ce type
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="blacklistTarget"
                  value="sender"
                  checked={target === 'sender'}
                  onChange={() => setTarget('sender')}
                  disabled={loading}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Bloquer cet expéditeur exact : <strong>{fromEmail}</strong>
                </span>
              </label>

              {fromDomain && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="blacklistTarget"
                    value="domain"
                    checked={target === 'domain'}
                    onChange={() => setTarget('domain')}
                    disabled={loading}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Bloquer tout le domaine : <strong>@{fromDomain}</strong> (toutes les adresses qui finissent par ce domaine)
                  </span>
                </label>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="blacklistTarget"
                  value="none"
                  checked={target === 'none'}
                  onChange={() => setTarget('none')}
                  disabled={loading}
                  style={{ marginTop: 2 }}
                />
                <span>Ne rien bloquer (archiver seulement)</span>
              </label>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--ink-secondary)', fontSize: 13 }}>
            Cette demande n&apos;a pas de message source — pas de suggestion blacklist.
          </div>
        )}

        {error && (
          <div style={{ color: '#DC2626', fontSize: 13, marginTop: 12 }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
              padding: '8px 14px',
              fontSize: 13,
              borderRadius: 'var(--r-sm)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={loading}
            style={{
              background: 'var(--ink, #1a1a1a)',
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 'var(--r-sm)',
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Archivage…' : 'Archiver'}
          </button>
        </div>
      </div>
    </div>
  )
}
