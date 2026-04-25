import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: '#FAF8F5', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 40px',
        maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 4px 24px rgba(28,25,23,.08)',
      }}>
        <div style={{
          fontSize: 48, fontWeight: 700, color: '#E5E0D9',
          letterSpacing: '-0.03em', margin: '0 0 16px',
        }}>404</div>
        <h1 style={{ fontSize: 18, fontWeight: 650, color: '#1C1917', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          Page introuvable
        </h1>
        <p style={{ fontSize: 14, color: '#78716C', lineHeight: 1.6, margin: '0 0 28px' }}>
          Cette page n&apos;existe pas ou vous n&apos;avez pas les droits pour y accéder.
        </p>
        <Link href="/dashboard" style={{
          display: 'inline-block', padding: '9px 20px',
          borderRadius: 8, background: '#9F1239', color: '#fff',
          fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
        }}>
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  )
}
