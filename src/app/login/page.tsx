'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Image from 'next/image'

function LoginContent() {
  const params = useSearchParams()
  const error = params.get('error')

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
          <Image src="/robine-logo.png" alt="Robine" width={220} height={52} priority style={{ objectFit: 'contain' }} />
        </div>
        <p style={{
          color: 'var(--color-ink-secondary)',
          marginBottom: '2.5rem',
          fontSize: '0.95rem',
        }}>
          Gestion des groupes &amp; événements
        </p>
        {error && (
          <p style={{
            color: '#9F1239',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            background: '#fff1f2',
            borderRadius: '8px',
            border: '1px solid #fecdd3',
          }}>
            {error === 'AccessDenied'
              ? 'Accès refusé. Ce compte n\'est pas autorisé à accéder à Robin.'
              : 'Une erreur est survenue. Réessayez.'}
          </p>
        )}
        <button
          onClick={() => signIn('microsoft-entra-id', { callbackUrl: '/dashboard' })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.625rem',
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.75rem',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: 500,
          }}
        >
          Connexion avec Microsoft
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
