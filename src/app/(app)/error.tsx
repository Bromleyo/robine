'use client'

import { useEffect } from 'react'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{
      flex: 1, display: 'grid', placeItems: 'center',
      background: 'var(--surface)', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 4px 24px rgba(28,25,23,.07)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#FEF2F2', display: 'grid', placeItems: 'center',
          margin: '0 auto 18px',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 650, color: 'var(--ink-900)', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          Une erreur est survenue
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {error.message || "Quelque chose s'est mal passé. Réessayez ou contactez le support."}
        </p>
        <button
          onClick={reset}
          style={{
            padding: '9px 20px', borderRadius: 'var(--r-sm)',
            background: 'var(--accent)', color: '#fff',
            fontSize: 13.5, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
