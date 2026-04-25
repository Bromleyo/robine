'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface Mailbox {
  id: string
  email: string
  displayName: string | null
  provider: string
  actif: boolean
  subscriptionId: string | null
  subscriptionExpiry: string | null
  createdAt: string
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}


const SUCCESS_MESSAGES: Record<string, string> = {
  gmail_connected: 'Boîte Gmail connectée avec succès.',
  ms_connected: 'Boîte Outlook connectée avec succès.',
}

const ERROR_MESSAGES: Record<string, string> = {
  gmail_denied: 'Autorisation Google refusée.',
  ms_denied: 'Autorisation Microsoft refusée.',
  invalid_state: 'Session expirée, veuillez réessayer.',
  gmail_no_refresh_token: 'Google n\'a pas retourné de token de rafraîchissement. Réessayez en révoquant l\'accès depuis votre compte Google.',
  ms_token_failed: 'Échec de récupération du token Microsoft.',
  ms_no_refresh_token: 'Microsoft n\'a pas retourné de token de rafraîchissement.',
  ms_no_profile: 'Impossible de récupérer le profil Microsoft.',
  ms_no_email: 'Impossible de récupérer l\'adresse email.',
  gmail_no_email: 'Impossible de récupérer l\'adresse email Google.',
}

export default function MailboxesClient() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const successKey = searchParams.get('success') ?? ''
  const errorKey = searchParams.get('error') ?? ''
  const successMsg = SUCCESS_MESSAGES[successKey] ?? ''
  const errorMsg = ERROR_MESSAGES[errorKey] ?? ''

  useEffect(() => {
    void fetch('/api/mailboxes')
      .then(r => r.json())
      .then((data: Mailbox[]) => { setMailboxes(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleToggle(id: string, current: boolean) {
    setToggling(id)
    const res = await fetch(`/api/mailboxes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !current }),
    })
    if (res.ok) {
      const updated = await res.json() as { id: string; actif: boolean }
      setMailboxes(prev => prev.map(m => m.id === id ? { ...m, actif: updated.actif } : m))
    }
    setToggling(null)
  }

  async function handleSubscribe(id: string) {
    setSubscribing(id)
    const res = await fetch(`/api/mailboxes/${id}/subscribe`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json() as { subscriptionId: string; expiry: string }
      setMailboxes(prev => prev.map(m => m.id === id
        ? { ...m, subscriptionId: data.subscriptionId, subscriptionExpiry: data.expiry, actif: true }
        : m))
    }
    setSubscribing(null)
  }


  if (loading) {
    return <div style={{ padding: '48px 24px', color: 'var(--ink-400)', fontSize: 13 }}>Chargement…</div>
  }

  return (
    <div style={{ padding: '20px 28px' }}>
      {successMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 6, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', fontSize: 13 }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13 }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {mailboxes.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
            Aucune boîte mail connectée.
          </div>
        )}

        {mailboxes.map(m => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 18px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 550, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.displayName ?? m.email}
              </div>
              {m.displayName && (
                <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 1 }}>{m.email}</div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>
                {m.provider === 'GMAIL' ? '📧 Gmail · poll 5 min' : m.provider === 'MICROSOFT' && !m.subscriptionId ? '📧 Outlook · poll 5 min' : m.subscriptionId ? `Outlook Webhook · exp. ${formatDate(m.subscriptionExpiry)}` : 'Outlook · pas de sync'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                Ajoutée le {formatDate(m.createdAt)}
              </div>
            </div>

            {m.provider === 'MICROSOFT' && !m.subscriptionId && (
              <button
                onClick={() => void handleSubscribe(m.id)}
                disabled={subscribing === m.id}
                style={{
                  padding: '5px 12px', fontSize: 12.5, fontWeight: 500,
                  borderRadius: 'var(--r-sm)', cursor: subscribing === m.id ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-sunken)',
                  color: 'var(--ink-600)',
                  flexShrink: 0,
                }}
              >
                {subscribing === m.id ? '…' : 'Activer Webhook'}
              </button>
            )}

            <button
              onClick={() => void handleToggle(m.id, m.actif)}
              disabled={toggling === m.id}
              style={{
                padding: '5px 12px', fontSize: 12.5, fontWeight: 500,
                borderRadius: 'var(--r-sm)', cursor: toggling === m.id ? 'not-allowed' : 'pointer',
                border: '1px solid',
                borderColor: m.actif ? '#BBF7D0' : 'var(--border)',
                background: m.actif ? '#F0FDF4' : 'var(--surface-sunken)',
                color: m.actif ? '#166534' : 'var(--ink-500)',
                flexShrink: 0,
              }}
            >
              {toggling === m.id ? '…' : m.actif ? 'Active' : 'Inactive'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href="/api/mailboxes/connect/gmail"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            borderRadius: 6, border: '1px solid #DADCE0',
            background: '#fff', color: '#3C4043', textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 5a19 19 0 0 0-7.26 36.6L24 34l7.26 7.6A19 19 0 0 0 24 5z"/><path fill="#4285F4" d="M43 24c0-1-.09-2-.24-2.95L24 24v4.5h10.73A10.27 10.27 0 0 1 30.6 33l7.1 5.5A19 19 0 0 0 43 24z"/><path fill="#FBBC05" d="M9.4 28.55A11.23 11.23 0 0 1 8.75 25a11.23 11.23 0 0 1 .65-3.55L2.9 16.4A19 19 0 0 0 5 24a19 19 0 0 0 2.1 7.6z"/><path fill="#34A853" d="M24 43a18.93 18.93 0 0 0 13.7-5.5l-7.1-5.5A11.3 11.3 0 0 1 24 34a11.3 11.3 0 0 1-10.73-7.45l-7.26 5.6A19 19 0 0 0 24 43z"/></svg>
          Connecter Gmail
        </a>
        <a
          href="/api/mailboxes/connect/microsoft"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            borderRadius: 6, border: '1px solid #D2D2D2',
            background: '#fff', color: '#2F2F2F', textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>
          Connecter Outlook
        </a>
      </div>
    </div>
  )
}
