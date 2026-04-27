'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TypeEvenement } from '@prisma/client'

const TYPE_LABELS: Record<TypeEvenement, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise", ANNIVERSAIRE: 'Anniversaire',
  SEMINAIRE: 'Séminaire', PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente', APPROVED: 'Approuvé', REJECTED: 'Rejeté',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'var(--ink-400)', APPROVED: '#16a34a', REJECTED: '#dc2626',
}

type Example = {
  id: string
  subject: string
  typeEvenement: TypeEvenement | null
  status: string
  contactName: string | null
  contactEmail: string
  startDate: string
  messageCount: number
  approvedAt: string | null
  notes: string | null
}

type Message = {
  id: string
  direction: 'IN' | 'OUT'
  fromName: string | null
  fromEmail: string
  bodyText: string
  sentAt: string | null
}

type Detail = Example & { messages: Message[] }

export default function ConversationsClient() {
  const [examples, setExamples] = useState<Example[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState<{ created: number; skipped: number } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [editType, setEditType] = useState<TypeEvenement | ''>('')
  const [editNotes, setEditNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter) params.set('typeEvenement', typeFilter)
    const res = await fetch(`/api/admin/conversations?${params}`)
    if (res.ok) {
      const data = await res.json() as { examples: Example[]; total: number; pages: number }
      setExamples(data.examples)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [page, statusFilter, typeFilter])

  useEffect(() => { void load() }, [load])

  async function handleExtract() {
    setExtracting(true)
    setExtractResult(null)
    const res = await fetch('/api/admin/extract-conversations', { method: 'POST' })
    if (res.ok) {
      const data = await res.json() as { created: number; skipped: number }
      setExtractResult(data)
      void load()
    }
    setExtracting(false)
  }

  async function handleExpand(id: string) {
    if (expanded === id) { setExpanded(null); setDetail(null); return }
    setExpanded(id)
    setDetail(null)
    const res = await fetch(`/api/admin/conversations/${id}`)
    if (res.ok) {
      const data = await res.json() as Detail
      setDetail(data)
      setEditType(data.typeEvenement ?? '')
      setEditNotes(data.notes ?? '')
    }
  }

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActionLoading(true)
    await fetch(`/api/admin/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, typeEvenement: editType || undefined, notes: editNotes || undefined }),
    })
    setExpanded(null)
    setDetail(null)
    await load()
    setActionLoading(false)
  }

  const cell: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
  const th: React.CSSProperties = { ...cell, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', background: 'var(--surface-sunken)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => void handleExtract()}
          disabled={extracting}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: extracting ? 'default' : 'pointer', color: 'var(--ink-700)' }}
        >
          {extracting ? 'Extraction…' : 'Extraire les conversations'}
        </button>
        {extractResult && (
          <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
            {extractResult.created} nouvelles · {extractResult.skipped} ignorées
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-700)' }}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-700)' }}>
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{total} conversation{total !== 1 ? 's' : ''}</div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Sujet</th>
              <th style={th}>Contact</th>
              <th style={th}>Type</th>
              <th style={th}>Date</th>
              <th style={th}>Msg</th>
              <th style={th}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: 'var(--ink-400)' }}>Chargement…</td></tr>
            )}
            {!loading && examples.length === 0 && (
              <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: 'var(--ink-400)' }}>Aucune conversation</td></tr>
            )}
            {examples.map(ex => (
              <>
                <tr
                  key={ex.id}
                  onClick={() => void handleExpand(ex.id)}
                  style={{ cursor: 'pointer', background: expanded === ex.id ? 'var(--surface-sunken)' : 'transparent' }}
                >
                  <td style={{ ...cell, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{ex.subject}</td>
                  <td style={cell}>{ex.contactName ?? ex.contactEmail}</td>
                  <td style={cell}>{ex.typeEvenement ? TYPE_LABELS[ex.typeEvenement] : <span style={{ color: 'var(--ink-400)' }}>—</span>}</td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{new Date(ex.startDate).toLocaleDateString('fr-FR')}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{ex.messageCount}</td>
                  <td style={{ ...cell, fontWeight: 500, color: STATUS_COLORS[ex.status] ?? 'inherit' }}>{STATUS_LABELS[ex.status] ?? ex.status}</td>
                </tr>
                {expanded === ex.id && (
                  <tr key={`${ex.id}-detail`}>
                    <td colSpan={6} style={{ padding: '16px 20px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                      {!detail ? (
                        <div style={{ color: 'var(--ink-400)', fontSize: 13 }}>Chargement…</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                            {detail.messages.map(m => (
                              <div key={m.id} style={{
                                padding: '10px 14px', borderRadius: 'var(--r-sm)',
                                background: m.direction === 'OUT' ? 'var(--accent-soft)' : 'var(--surface)',
                                border: '1px solid var(--border)', fontSize: 12.5, lineHeight: 1.55,
                                alignSelf: m.direction === 'OUT' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                              }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', marginBottom: 4 }}>
                                  {m.direction === 'IN' ? (m.fromName ?? m.fromEmail) : 'Nous'}
                                </div>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{m.bodyText.slice(0, 600)}{m.bodyText.length > 600 ? '…' : ''}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)' }}>Type</label>
                              <select value={editType} onChange={e => setEditType(e.target.value as TypeEvenement | '')}
                                style={{ fontSize: 13, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-700)' }}>
                                <option value="">Non défini</option>
                                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
                              <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)' }}>Notes</label>
                              <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                                placeholder="Notes internes…"
                                style={{ fontSize: 13, padding: '5px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-700)' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => void handleAction(ex.id, 'approve')} disabled={actionLoading}
                                style={{ padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--r-sm)', border: '1px solid #16a34a', background: '#16a34a', color: '#fff', cursor: actionLoading ? 'default' : 'pointer' }}>
                                Approuver
                              </button>
                              <button onClick={() => void handleAction(ex.id, 'reject')} disabled={actionLoading}
                                style={{ padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: '#dc2626', cursor: actionLoading ? 'default' : 'pointer' }}>
                                Rejeter
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '5px 12px', fontSize: 13, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: page === 1 ? 'default' : 'pointer', color: 'var(--ink-700)' }}>
            ←
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink-500)', padding: '5px 8px' }}>{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            style={{ padding: '5px 12px', fontSize: 13, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: page === pages ? 'default' : 'pointer', color: 'var(--ink-700)' }}>
            →
          </button>
        </div>
      )}
    </div>
  )
}
