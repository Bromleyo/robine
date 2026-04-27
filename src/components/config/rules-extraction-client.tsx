'use client'

import { useState, useEffect, useCallback } from 'react'

interface Mailbox {
  id: string
  email: string
  displayName: string | null
}

interface ThreadItem {
  conversationId: string
  subject: string
  senderEmail: string
  firstMessageDate: string
  messageCount: number
  firstMessagePreview: string
}

interface Props {
  mailboxes: Mailbox[]
}

type Phase = 'initial' | 'loading-threads' | 'validation' | 'loading-analysis' | 'result'

function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  let inPara = false

  function esc(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function inline(s: string) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--surface-sunken);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>')
  }

  for (const raw of lines) {
    const h2 = raw.match(/^## (.+)$/)
    const h3 = raw.match(/^### (.+)$/)
    const h1 = raw.match(/^# (.+)$/)
    const li = raw.match(/^[-*] (.+)$/)
    const blank = raw.trim() === ''

    if (inList && !li) { out.push('</ul>'); inList = false }
    if (inPara && (blank || h1 || h2 || h3 || li)) { out.push('</p>'); inPara = false }

    if (h2) {
      out.push(`<h2 style="font-size:16px;font-weight:600;margin:24px 0 8px;color:var(--ink-900)">${inline(h2[1])}</h2>`)
    } else if (h3) {
      out.push(`<h3 style="font-size:14px;font-weight:600;margin:16px 0 6px;color:var(--ink-800)">${inline(h3[1])}</h3>`)
    } else if (h1) {
      out.push(`<h1 style="font-size:18px;font-weight:700;margin:0 0 16px;color:var(--ink-900)">${inline(h1[1])}</h1>`)
    } else if (li) {
      if (!inList) { out.push('<ul style="margin:4px 0 8px;padding-left:20px">'); inList = true }
      out.push(`<li style="margin:3px 0;line-height:1.5">${inline(li[1])}</li>`)
    } else if (!blank) {
      if (!inPara) { out.push('<p style="margin:0 0 10px;line-height:1.6">'); inPara = true }
      else out.push(' ')
      out.push(inline(raw))
    }
  }

  if (inList) out.push('</ul>')
  if (inPara) out.push('</p>')
  return out.join('\n')
}

export default function RulesExtractionClient({ mailboxes }: Props) {
  const [phase, setPhase] = useState<Phase>('initial')
  const [selectedMailboxId, setSelectedMailboxId] = useState(mailboxes[0]?.id ?? '')
  const [threads, setThreads] = useState<ThreadItem[]>([])
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [markdown, setMarkdown] = useState('')
  const [tokensUsed, setTokensUsed] = useState<{ input: number; output: number } | null>(null)
  const [fetchStats, setFetchStats] = useState<{
    totalFetched: number
    afterAutoFilter: number
    rejectionStats?: { rejectedNoReplyFromUs: number; rejectedTooFewMessages: number; rejectedAutoFilter: number }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [hoveredPreview, setHoveredPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedMailboxId) return
    const key = `rules-extraction-deselected-${selectedMailboxId}`
    const stored = localStorage.getItem(key)
    if (stored) {
      try { setDeselected(new Set(JSON.parse(stored) as string[])) }
      catch { setDeselected(new Set()) }
    } else {
      setDeselected(new Set())
    }
  }, [selectedMailboxId])

  const persistDeselected = useCallback((next: Set<string>) => {
    const key = `rules-extraction-deselected-${selectedMailboxId}`
    localStorage.setItem(key, JSON.stringify([...next]))
  }, [selectedMailboxId])

  const toggleThread = (cid: string) => {
    setDeselected(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      persistDeselected(next)
      return next
    })
  }

  const selectAll = () => {
    const empty = new Set<string>()
    setDeselected(empty)
    persistDeselected(empty)
  }

  const deselectAll = () => {
    const all = new Set(threads.map(t => t.conversationId))
    setDeselected(all)
    persistDeselected(all)
  }

  const fetchThreads = async () => {
    setPhase('loading-threads')
    setError(null)
    try {
      const res = await fetch('/api/admin/rules-extraction/fetch-threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxId: selectedMailboxId }),
      })
      const data = await res.json() as {
        threads?: ThreadItem[]
        totalFetched?: number
        afterAutoFilter?: number
        rejectionStats?: { rejectedNoReplyFromUs: number; rejectedTooFewMessages: number; rejectedAutoFilter: number }
        error?: string
      }
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de la récupération des threads')
        setPhase('initial')
        return
      }
      setThreads(data.threads ?? [])
      setFetchStats({
        totalFetched: data.totalFetched ?? 0,
        afterAutoFilter: data.afterAutoFilter ?? 0,
        rejectionStats: data.rejectionStats,
      })
      setPhase('validation')
    } catch {
      setError('Erreur réseau')
      setPhase('initial')
    }
  }

  const analyzeThreads = async () => {
    const selectedIds = threads.map(t => t.conversationId).filter(id => !deselected.has(id))
    if (selectedIds.length === 0) return
    setPhase('loading-analysis')
    setError(null)
    try {
      const res = await fetch('/api/admin/rules-extraction/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxId: selectedMailboxId, conversationIds: selectedIds }),
      })
      const data = await res.json() as {
        markdown?: string
        threadsAnalyzed?: number
        tokensUsed?: { input: number; output: number }
        error?: string
      }
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'analyse")
        setPhase('validation')
        return
      }
      setMarkdown(data.markdown ?? '')
      setTokensUsed(data.tokensUsed ?? null)
      setPhase('result')
    } catch {
      setError('Erreur réseau')
      setPhase('validation')
    }
  }

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedCount = threads.length - deselected.size

  // ── État A : initial / chargement threads ─────────────────────────
  if (phase === 'initial' || phase === 'loading-threads') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 540 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 12 }}>
            Extraction de règles IA
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ink-500)', lineHeight: 1.6, marginBottom: 24 }}>
            Robin va analyser vos échanges email événementiels des 12 derniers mois,
            filtrer les conversations pertinentes, puis vous laisser valider la sélection
            avant de lancer l'analyse Sonnet. Opération one-shot — aucune donnée
            n'est stockée en base.
          </p>

          {mailboxes.length > 1 ? (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: 'var(--ink-600)', display: 'block', marginBottom: 6 }}>
                Boîte mail à analyser
              </label>
              <select
                value={selectedMailboxId}
                onChange={e => setSelectedMailboxId(e.target.value)}
                disabled={phase === 'loading-threads'}
                style={{
                  padding: '8px 12px', borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  fontSize: 14, color: 'var(--ink-800)', minWidth: 260, cursor: 'pointer',
                }}
              >
                {mailboxes.map(mb => (
                  <option key={mb.id} value={mb.id}>{mb.displayName ?? mb.email}</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--ink-500)' }}>
              Boîte : <strong style={{ color: 'var(--ink-700)' }}>{mailboxes[0]?.displayName ?? mailboxes[0]?.email}</strong>
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--r-sm)', fontSize: 13, color: '#B91C1C' }}>
              {error}
            </div>
          )}

          <button
            onClick={fetchThreads}
            disabled={phase === 'loading-threads' || !selectedMailboxId}
            style={{
              padding: '12px 32px', borderRadius: 'var(--r-sm)',
              background: phase === 'loading-threads' ? 'var(--surface-sunken)' : 'var(--accent)',
              color: phase === 'loading-threads' ? 'var(--ink-500)' : '#fff',
              border: phase === 'loading-threads' ? '1px solid var(--border)' : 'none',
              fontSize: 14, fontWeight: 550,
              cursor: phase === 'loading-threads' ? 'default' : 'pointer',
            }}
          >
            {phase === 'loading-threads' ? 'Récupération en cours…' : "Lancer l'extraction"}
          </button>
        </div>
      </div>
    )
  }

  // ── État B : validation ───────────────────────────────────────────
  if (phase === 'validation' || phase === 'loading-analysis') {
    const isAnalyzing = phase === 'loading-analysis'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>
              {threads.length} conversations trouvées
            </div>
            {fetchStats && (
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                {fetchStats.totalFetched} messages récupérés · {fetchStats.afterAutoFilter} threads uniques · {threads.length} retenus après filtre
              </div>
            )}
            {fetchStats?.rejectionStats && (
              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4, display: 'flex', gap: 16 }}>
                <span>
                  <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>{fetchStats.rejectionStats.rejectedNoReplyFromUs}</span>
                  {' '}sans réponse de notre part
                </span>
                <span>
                  <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>{fetchStats.rejectionStats.rejectedTooFewMessages}</span>
                  {' '}trop courts (1 message)
                </span>
                <span>
                  <span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>{fetchStats.rejectionStats.rejectedAutoFilter}</span>
                  {' '}filtrés (spam/date)
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={selectAll} disabled={isAnalyzing} style={S.btnSecondary}>Tout cocher</button>
            <button onClick={deselectAll} disabled={isAnalyzing} style={S.btnSecondary}>Tout décocher</button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--r-sm)', fontSize: 13, color: '#B91C1C' }}>
            {error}
          </div>
        )}

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', marginBottom: 80 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                <th style={S.th}></th>
                <th style={{ ...S.th, textAlign: 'left', minWidth: 220 }}>Sujet</th>
                <th style={{ ...S.th, textAlign: 'left', minWidth: 160 }}>Expéditeur</th>
                <th style={{ ...S.th, textAlign: 'left', width: 90 }}>Date</th>
                <th style={{ ...S.th, textAlign: 'center', width: 56 }}>Msg</th>
                <th style={{ ...S.th, textAlign: 'left' }}>Aperçu</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t, i) => {
                const checked = !deselected.has(t.conversationId)
                return (
                  <tr
                    key={t.conversationId}
                    style={{
                      borderBottom: i < threads.length - 1 ? '1px solid var(--hairline)' : 'none',
                      background: checked ? 'transparent' : 'var(--surface-sunken)',
                      opacity: checked ? 1 : 0.5,
                      cursor: isAnalyzing ? 'default' : 'pointer',
                    }}
                    onClick={() => { if (!isAnalyzing) toggleThread(t.conversationId) }}
                  >
                    <td style={{ ...S.td, textAlign: 'center', width: 36 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => { if (!isAnalyzing) toggleThread(t.conversationId) }}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: isAnalyzing ? 'default' : 'pointer' }}
                      />
                    </td>
                    <td style={{ ...S.td, fontWeight: checked ? 500 : 400 }}>
                      {t.subject || '(sans objet)'}
                    </td>
                    <td style={{ ...S.td, color: 'var(--ink-500)' }}>{t.senderEmail}</td>
                    <td style={{ ...S.td, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                      {new Date(t.firstMessageDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td style={{ ...S.td, textAlign: 'center', color: 'var(--ink-500)' }}>{t.messageCount}</td>
                    <td
                      style={{ ...S.td, color: 'var(--ink-400)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative' }}
                      onMouseEnter={() => setHoveredPreview(t.conversationId)}
                      onMouseLeave={() => setHoveredPreview(null)}
                    >
                      {t.firstMessagePreview.slice(0, 120)}
                      {hoveredPreview === t.conversationId && (
                        <div style={{
                          position: 'fixed', zIndex: 200,
                          background: 'var(--ink-900)', color: '#fff',
                          padding: '8px 12px', borderRadius: 'var(--r-sm)',
                          fontSize: 12, maxWidth: 360, lineHeight: 1.5,
                          whiteSpace: 'normal', pointerEvents: 'none',
                          transform: 'translateY(-100%) translateY(-6px)',
                        }}>
                          {t.firstMessagePreview}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Sticky footer */}
        <div style={{
          position: 'fixed', bottom: 0, left: 224, right: 0,
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 10,
        }}>
          <div style={{ fontSize: 13, color: 'var(--ink-600)' }}>
            <strong style={{ color: 'var(--ink-900)' }}>{selectedCount}</strong>{' '}
            conversation{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''} sur {threads.length}
          </div>
          <button
            onClick={analyzeThreads}
            disabled={selectedCount === 0 || isAnalyzing}
            style={{
              padding: '10px 28px', borderRadius: 'var(--r-sm)',
              background: selectedCount === 0 || isAnalyzing ? 'var(--surface-sunken)' : 'var(--accent)',
              color: selectedCount === 0 || isAnalyzing ? 'var(--ink-500)' : '#fff',
              border: selectedCount === 0 || isAnalyzing ? '1px solid var(--border)' : 'none',
              fontSize: 14, fontWeight: 550,
              cursor: selectedCount === 0 || isAnalyzing ? 'default' : 'pointer',
            }}
          >
            {isAnalyzing
              ? 'Analyse en cours… (1-2 min)'
              : `Analyser les ${selectedCount} conversations sélectionnées`}
          </button>
        </div>
      </div>
    )
  }

  // ── État C : résultat ─────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'var(--surface-sunken)',
        borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--ink-600)' }}>
          {tokensUsed && (
            <span>
              {threads.length - deselected.size} conversations analysées ·{' '}
              {(tokensUsed.input / 1000).toFixed(0)}k tokens en entrée ·{' '}
              {(tokensUsed.output / 1000).toFixed(0)}k tokens en sortie
            </span>
          )}
        </div>
        <button onClick={copyMarkdown} style={{ ...S.btnSecondary, minWidth: 190 }}>
          {copied ? '✓ Copié !' : 'Copier le markdown brut'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>
        Copie ce document et colle-le dans{' '}
        <a href="/config/regles-ia" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          /config/regles-ia
        </a>. Tu peux l'éditer avant de le sauvegarder.
      </p>

      <div
        style={{
          border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
          padding: '24px 28px', background: 'var(--surface)',
          fontSize: 14, color: 'var(--ink-800)', lineHeight: 1.6,
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
      />
    </div>
  )
}

const S = {
  th: {
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 550,
    color: 'var(--ink-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  td: {
    padding: '9px 12px',
    color: 'var(--ink-800)',
    verticalAlign: 'middle',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '6px 14px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    fontSize: 13,
    color: 'var(--ink-700)',
    cursor: 'pointer',
  } as React.CSSProperties,
}
