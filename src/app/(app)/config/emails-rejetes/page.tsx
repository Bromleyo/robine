'use client'

import { useEffect, useState, useCallback } from 'react'
import Topbar from '@/components/layout/topbar'

const REASON_LABEL: Record<string, string> = {
  not_addressed: 'Pas destinataire',
  spam_headers: 'Headers spam',
  noreply_sender: 'Expéditeur noreply',
  prospection: 'Prospection',
  blacklisted_domain: 'Domaine blacklisté',
}

const REASON_COLOR: Record<string, string> = {
  not_addressed: '#6B7280',
  spam_headers: '#9CA3AF',
  noreply_sender: '#9CA3AF',
  prospection: '#DC2626',
  blacklisted_domain: '#9F1239',
}

interface RejectedEmail {
  id: string
  fromEmail: string
  fromName: string | null
  subject: string | null
  rejectReason: string
  details: string | null
  bodySnippet: string | null
  receivedAt: string
  mailbox: { email: string }
}

export default function EmailsRejeteesPage() {
  const [items, setItems] = useState<RejectedEmail[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [rehabId, setRehabId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(page) })
    if (reason) qs.set('reason', reason)
    const res = await fetch(`/api/rejected-emails?${qs}`)
    const data = await res.json()
    setItems(data.items ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [page, reason])

  useEffect(() => { void load() }, [load])

  async function rehabilitate(id: string) {
    setRehabId(id)
    const res = await fetch(`/api/rejected-emails/${id}/rehabilitate`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json() as { demandeId: string; reference: string }
      setItems(prev => prev.filter(i => i.id !== id))
      setTotal(prev => prev - 1)
      alert(`Demande ${data.reference} créée.`)
    } else {
      alert('Erreur lors de la réhabilitation.')
    }
    setRehabId(null)
  }

  async function purge() {
    if (!confirm('Supprimer tous les emails rejetés de plus de 90 jours ?')) return
    setPurging(true)
    const res = await fetch('/api/rejected-emails', { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json() as { deleted: number }
      alert(`${data.deleted} entrées supprimées.`)
      void load()
    }
    setPurging(false)
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <>
      <Topbar title="Emails rejetés" subtitle="Audit et réhabilitation des emails filtrés" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            value={reason}
            onChange={e => { setReason(e.target.value); setPage(1) }}
            style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--ink-700)',
            }}
          >
            <option value="">Tous les motifs</option>
            {Object.entries(REASON_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <span style={{ fontSize: 13, color: 'var(--ink-400)', flex: 1 }}>
            {total} email{total !== 1 ? 's' : ''} rejeté{total !== 1 ? 's' : ''}
          </span>

          <button
            onClick={purge}
            disabled={purging}
            style={{
              fontSize: 12.5, padding: '6px 12px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--ink-500)', cursor: 'pointer',
            }}
          >
            {purging ? 'Purge…' : 'Purger > 90 jours'}
          </button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--ink-300)', fontSize: 13 }}>Chargement…</div>
        ) : items.length === 0 ? (
          <div style={{ color: 'var(--ink-300)', fontSize: 13, fontStyle: 'italic' }}>Aucun email rejeté.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map(item => (
              <div key={item.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)', overflow: 'hidden',
              }}>
                <div
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: `${REASON_COLOR[item.rejectReason] ?? '#6B7280'}20`,
                    color: REASON_COLOR[item.rejectReason] ?? '#6B7280', flexShrink: 0,
                  }}>
                    {REASON_LABEL[item.rejectReason] ?? item.rejectReason}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.fromName ? `${item.fromName} <${item.fromEmail}>` : item.fromEmail}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.subject ?? '(sans objet)'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-400)', flexShrink: 0 }}>
                    {new Date(item.receivedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); void rehabilitate(item.id) }}
                    disabled={rehabId === item.id}
                    style={{
                      fontSize: 12, padding: '4px 10px', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--accent)', color: 'var(--accent)',
                      background: 'transparent', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {rehabId === item.id ? '…' : 'Réhabiliter'}
                  </button>
                </div>

                {expanded === item.id && (
                  <div style={{
                    borderTop: '1px solid var(--hairline)', padding: '12px 16px',
                    fontSize: 12.5, color: 'var(--ink-600)', display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    {item.details && (
                      <div><span style={{ color: 'var(--ink-400)' }}>Motif détaillé :</span> {item.details}</div>
                    )}
                    {item.bodySnippet && (
                      <div style={{
                        background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)',
                        padding: '8px 10px', fontSize: 12, color: 'var(--ink-500)',
                        fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                      }}>
                        {item.bodySnippet}
                      </div>
                    )}
                    <div style={{ color: 'var(--ink-400)' }}>Boîte : {item.mailbox.email}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ fontSize: 13, padding: '4px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: page > 1 ? 'pointer' : 'default', color: 'var(--ink-500)' }}>←</button>
            <span style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: '30px' }}>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              style={{ fontSize: 13, padding: '4px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: page < totalPages ? 'pointer' : 'default', color: 'var(--ink-500)' }}>→</button>
          </div>
        )}
      </div>
    </>
  )
}
