'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function OnboardingPage() {
  const router = useRouter()
  const { update } = useSession()
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, emailGroupes: email }),
    })

    if (!res.ok && res.status !== 409) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Une erreur est survenue.')
      setLoading(false)
      return
    }

    await update()
    router.push('/dashboard')
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '2rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
          marginBottom: '0.375rem',
          letterSpacing: '-0.02em',
        }}>
          Bienvenue sur Robin
        </h1>
        <p style={{
          color: 'var(--color-ink-secondary)',
          marginBottom: '2rem',
          fontSize: '0.95rem',
        }}>
          Configurez votre établissement pour commencer.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-ink)' }}>
              Nom du restaurant
            </label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Le Robin"
              required
              style={{
                padding: '0.625rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.9375rem',
                outline: 'none',
                background: 'white',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-ink)' }}>
              Boîte mail des événements
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="groupes@monrestaurant.fr"
              required
              style={{
                padding: '0.625rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.9375rem',
                outline: 'none',
                background: 'white',
              }}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-ink-secondary)' }}>
              Les emails reçus sur cette adresse seront traités automatiquement.
            </span>
          </div>

          {error && (
            <p style={{
              color: '#9F1239',
              fontSize: '0.875rem',
              padding: '0.75rem 1rem',
              background: '#fff1f2',
              borderRadius: '8px',
              border: '1px solid #fecdd3',
              margin: 0,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'var(--color-accent)',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.9375rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Création en cours…' : 'Créer mon espace'}
          </button>
        </form>
      </div>
    </div>
  )
}
