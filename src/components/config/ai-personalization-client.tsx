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

interface FetchStats {
  totalFetched: number
  afterAutoFilter: number
  rejectionStats?: { rejectedNoReplyFromUs: number; rejectedTooFewMessages: number; rejectedAutoFilter: number }
  diagnostics?: Record<string, unknown>
}

interface AIPersonalizationData {
  id: string
  mailboxId: string
  mailboxEmail: string
  mailboxDisplayName: string | null
  threadsAnalyzed: number
  rulesMarkdown: string
  keywords: string[]
  createdAt: string
}

interface Props {
  mailboxes: Mailbox[]
  initialPersonalization: AIPersonalizationData | null
}

type WizardStep = 'mailbox' | 'keywords' | 'threads' | 'analyzing'

const DEFAULT_KEYWORDS = [
  'privatisation', 'privatiser', 'mariage', 'noces', 'séminaire',
  'seminaire', 'cocktail', 'anniversaire', 'baptême', 'bapteme',
  'communion', 'enterrement', 'groupe', 'événement', 'evenement',
  'devis', 'réception', 'reception', 'convives', 'couverts',
]

const LS_KEYWORDS_KEY = 'ai-personalization-keywords'
const LS_DESELECTED_KEY = (mailboxId: string) => `ai-personalization-deselected-${mailboxId}`

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

export default function AIPersonalizationClient({ mailboxes, initialPersonalization }: Props) {
  const [personalization, setPersonalization] = useState<AIPersonalizationData | null>(initialPersonalization)
  const [step, setStep] = useState<WizardStep>('mailbox')
  const [selectedMailboxId, setSelectedMailboxId] = useState(mailboxes[0]?.id ?? '')
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS)
  const [newKeyword, setNewKeyword] = useState('')
  const [threads, setThreads] = useState<ThreadItem[]>([])
  const [fetchingThreads, setFetchingThreads] = useState(false)
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [fetchStats, setFetchStats] = useState<FetchStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [hoveredPreview, setHoveredPreview] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEYWORDS_KEY)
    if (stored) {
      try { setKeywords(JSON.parse(stored) as string[]) }
      catch { setKeywords(DEFAULT_KEYWORDS) }
    }
  }, [])

  useEffect(() => {
    if (!selectedMailboxId) return
    const stored = localStorage.getItem(LS_DESELECTED_KEY(selectedMailboxId))
    if (stored) {
      try { setDeselected(new Set(JSON.parse(stored) as string[])) }
      catch { setDeselected(new Set()) }
    } else {
      setDeselected(new Set())
    }
  }, [selectedMailboxId])

  const persistKeywords = useCallback((kw: string[]) => {
    setKeywords(kw)
    localStorage.setItem(LS_KEYWORDS_KEY, JSON.stringify(kw))
  }, [])

  const persistDeselected = useCallback((next: Set<string>) => {
    localStorage.setItem(LS_DESELECTED_KEY(selectedMailboxId), JSON.stringify([...next]))
  }, [selectedMailboxId])

  const removeKeyword = (kw: string) => persistKeywords(keywords.filter(k => k !== kw))
  const addKeyword = () => {
    const trimmed = newKeyword.trim().toLowerCase()
    if (trimmed && !keywords.includes(trimmed)) persistKeywords([...keywords, trimmed])
    setNewKeyword('')
  }

  const toggleThread = (cid: string) => {
    setDeselected(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      persistDeselected(next)
      return next
    })
  }

  const selectAll = () => { const e = new Set<string>(); setDeselected(e); persistDeselected(e) }
  const deselectAll = () => { const a = new Set(threads.map(t => t.conversationId)); setDeselected(a); persistDeselected(a) }

  const goToThreads = async () => {
    setStep('threads')
    setError(null)
    setThreads([])
    setFetchStats(null)
    setFetchingThreads(true)
    try {
      const res = await fetch('/api/admin/ai-personalization/fetch-threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxId: selectedMailboxId, keywords }),
      })
      const data = await res.json() as {
        threads?: ThreadItem[]
        totalFetched?: number
        afterAutoFilter?: number
        rejectionStats?: FetchStats['rejectionStats']
        diagnostics?: Record<string, unknown>
        error?: string
      }
      if (!res.ok) { setError(data.error ?? 'Erreur lors de la récupération'); return }
      setThreads(data.threads ?? [])
      setFetchStats({ totalFetched: data.totalFetched ?? 0, afterAutoFilter: data.afterAutoFilter ?? 0, rejectionStats: data.rejectionStats, diagnostics: data.diagnostics })
    } catch { setError('Erreur réseau') }
    finally { setFetchingThreads(false) }
  }

  const analyze = async () => {
    const selectedIds = threads.filter(t => !deselected.has(t.conversationId)).map(t => t.conversationId)
    if (selectedIds.length === 0) return
    setStep('analyzing')
    setError(null)
    try {
      const res = await fetch('/api/admin/ai-personalization/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxId: selectedMailboxId, conversationIds: selectedIds, keywords }),
      })
      const data = await res.json() as { personalization?: AIPersonalizationData; error?: string }
      if (!res.ok) { setError(data.error ?? "Erreur lors de l'analyse"); setStep('threads'); return }
      if (data.personalization) setPersonalization(data.personalization)
    } catch { setError('Erreur réseau'); setStep('threads') }
  }

  const reset = async () => {
    setResetting(true)
    try {
      await fetch('/api/admin/ai-personalization', { method: 'DELETE' })
      setPersonalization(null)
      setStep('mailbox')
      setThreads([])
      setFetchStats(null)
      setError(null)
    } catch { /* silent */ }
    finally { setResetting(false); setShowResetModal(false) }
  }

  const selectedCount = threads.length - deselected.size

  // ── État B : configurée ───────────────────────────────────────────
  if (personalization) {
    const preview = personalization.rulesMarkdown.slice(0, 600)
    const hasMore = personalization.rulesMarkdown.length > 600
    const configDate = new Date(personalization.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    const mailboxLabel = personalization.mailboxDisplayName ?? personalization.mailboxEmail

    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ padding: '20px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--ink-900)', marginBottom: 4 }}>
                ✓ IA personnalisée configurée
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                Configurée le {configDate} · {personalization.threadsAnalyzed} threads analysés depuis {mailboxLabel}
              </div>
            </div>
            <button onClick={() => setShowResetModal(true)} style={S.btnDanger}>Réinitialiser</button>
          </div>

          <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 8, fontWeight: 500 }}>Aperçu des règles</div>
            <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {preview}{hasMore ? '…' : ''}
            </div>
          </div>

          <button onClick={() => setShowRulesModal(true)} style={S.btnSecondary}>Voir les règles complètes</button>
        </div>

        {showRulesModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
            onClick={() => setShowRulesModal(false)}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-sm)', padding: '28px 32px', maxWidth: 760, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>Règles personnalisées complètes</div>
                <button onClick={() => setShowRulesModal(false)} style={{ ...S.btnSecondary, padding: '4px 10px' }}>✕</button>
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-800)', lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(personalization.rulesMarkdown) }} />
            </div>
          </div>
        )}

        {showResetModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-sm)', padding: '28px 32px', maxWidth: 480, width: '100%' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 12 }}>Réinitialiser l'IA personnalisée ?</div>
              <p style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6, marginBottom: 24 }}>
                Cette action supprimera votre IA personnalisée. Robin n'utilisera plus ces règles pour générer des brouillons. Vous devrez refaire l'analyse depuis zéro.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowResetModal(false)} style={S.btnSecondary} disabled={resetting}>Annuler</button>
                <button onClick={reset} style={S.btnDanger} disabled={resetting}>{resetting ? 'Suppression…' : 'Réinitialiser'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Indicateur d'étapes ──────────────────────────────────────────
  const STEP_ORDER: WizardStep[] = ['mailbox', 'keywords', 'threads', 'analyzing']
  const STEP_LABELS: Record<WizardStep, string> = { mailbox: 'Boîte mail', keywords: 'Mots-clés', threads: 'Validation', analyzing: 'Analyse' }
  const stepIdx = STEP_ORDER.indexOf(step)

  const StepIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
      {STEP_ORDER.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, background: i <= stepIdx ? 'var(--accent)' : 'var(--surface-sunken)', color: i <= stepIdx ? '#fff' : 'var(--ink-400)', border: i <= stepIdx ? 'none' : '1px solid var(--border)' }}>
              {i < stepIdx ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 11, color: i === stepIdx ? 'var(--accent-ink)' : 'var(--ink-400)', fontWeight: i === stepIdx ? 550 : 400 }}>
              {STEP_LABELS[s]}
            </div>
          </div>
          {i < STEP_ORDER.length - 1 && (
            <div style={{ width: 48, height: 1, background: i < stepIdx ? 'var(--accent)' : 'var(--border)', margin: '0 4px', marginBottom: 20 }} />
          )}
        </div>
      ))}
    </div>
  )

  // ── Étape 1 : Mailbox ─────────────────────────────────────────────
  if (step === 'mailbox') {
    return (
      <div style={{ maxWidth: 540 }}>
        <StepIndicator />
        <h2 style={{ fontSize: 18, fontWeight: 650, color: 'var(--ink-900)', marginBottom: 8 }}>Choisissez la boîte mail à analyser</h2>
        <p style={{ fontSize: 14, color: 'var(--ink-500)', lineHeight: 1.6, marginBottom: 28 }}>
          Robin va analyser les échanges événementiels des 12 derniers mois pour apprendre votre style de communication.
        </p>
        {mailboxes.length > 1 ? (
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: 'var(--ink-600)', display: 'block', marginBottom: 6 }}>Boîte mail</label>
            <select value={selectedMailboxId} onChange={e => setSelectedMailboxId(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 14, color: 'var(--ink-800)', minWidth: 280, cursor: 'pointer' }}>
              {mailboxes.map(mb => <option key={mb.id} value={mb.id}>{mb.displayName ?? mb.email}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ marginBottom: 24, padding: '12px 16px', background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', border: '1px solid var(--hairline)', fontSize: 13, color: 'var(--ink-700)' }}>
            {mailboxes[0]?.displayName ?? mailboxes[0]?.email}
          </div>
        )}
        <button onClick={() => setStep('keywords')} style={S.btnPrimary}>Continuer →</button>
      </div>
    )
  }

  // ── Étape 2 : Mots-clés ──────────────────────────────────────────
  if (step === 'keywords') {
    return (
      <div style={{ maxWidth: 640 }}>
        <StepIndicator />
        <h2 style={{ fontSize: 18, fontWeight: 650, color: 'var(--ink-900)', marginBottom: 8 }}>Mots-clés de recherche</h2>
        <p style={{ fontSize: 14, color: 'var(--ink-500)', lineHeight: 1.6, marginBottom: 24 }}>
          Robin recherche les emails dont le sujet contient ces mots. Ajoutez ou retirez des mots selon votre activité.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {keywords.map(kw => (
            <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent-ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500 }}>
              {kw}
              <button onClick={() => removeKeyword(kw)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent-ink)', fontSize: 14, lineHeight: 1, opacity: 0.7 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
            placeholder="Ajouter un mot-clé…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--ink-800)' }} />
          <button onClick={addKeyword} style={S.btnSecondary}>Ajouter</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('mailbox')} style={S.btnSecondary}>← Retour</button>
            <button onClick={() => persistKeywords(DEFAULT_KEYWORDS)} style={{ ...S.btnSecondary, fontSize: 12 }}>Réinitialiser aux défauts</button>
          </div>
          <button onClick={goToThreads} disabled={keywords.length === 0} style={S.btnPrimary}>Continuer →</button>
        </div>
      </div>
    )
  }

  // ── Étape 3 : Validation threads ─────────────────────────────────
  if (step === 'threads') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <StepIndicator />
        {fetchingThreads ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
            <div style={{ fontSize: 14, color: 'var(--ink-500)' }}>Récupération des conversations en cours…</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>{threads.length} conversations trouvées</div>
                {fetchStats && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                      {fetchStats.totalFetched} messages · {fetchStats.afterAutoFilter} threads uniques · {threads.length} retenus
                    </div>
                    {fetchStats.rejectionStats && (
                      <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span><span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>{fetchStats.rejectionStats.rejectedNoReplyFromUs}</span> sans réponse de notre part</span>
                        <span><span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>{fetchStats.rejectionStats.rejectedTooFewMessages}</span> trop courts</span>
                        <span><span style={{ color: 'var(--ink-500)', fontWeight: 500 }}>{fetchStats.rejectionStats.rejectedAutoFilter}</span> filtrés (spam/date)</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={selectAll} style={S.btnSecondary}>Tout cocher</button>
                <button onClick={deselectAll} style={S.btnSecondary}>Tout décocher</button>
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--r-sm)', fontSize: 13, color: '#B91C1C' }}>{error}</div>
            )}

            {threads.length === 0 && !error ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-500)', fontSize: 14 }}>
                Aucune conversation trouvée.{' '}
                <button onClick={() => setStep('keywords')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>
                  Modifier les mots-clés
                </button>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', marginBottom: 16 }}>
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
                        <tr key={t.conversationId}
                          style={{ borderBottom: i < threads.length - 1 ? '1px solid var(--hairline)' : 'none', background: checked ? 'transparent' : 'var(--surface-sunken)', opacity: checked ? 1 : 0.5, cursor: 'pointer' }}
                          onClick={() => toggleThread(t.conversationId)}>
                          <td style={{ ...S.td, textAlign: 'center', width: 36 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleThread(t.conversationId)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ ...S.td, fontWeight: checked ? 500 : 400 }}>{t.subject || '(sans objet)'}</td>
                          <td style={{ ...S.td, color: 'var(--ink-500)' }}>{t.senderEmail}</td>
                          <td style={{ ...S.td, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                            {new Date(t.firstMessageDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          </td>
                          <td style={{ ...S.td, textAlign: 'center', color: 'var(--ink-500)' }}>{t.messageCount}</td>
                          <td style={{ ...S.td, color: 'var(--ink-400)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative' }}
                            onMouseEnter={() => setHoveredPreview(t.conversationId)}
                            onMouseLeave={() => setHoveredPreview(null)}>
                            {t.firstMessagePreview.slice(0, 120)}
                            {hoveredPreview === t.conversationId && (
                              <div style={{ position: 'fixed', zIndex: 200, background: 'var(--ink-900)', color: '#fff', padding: '8px 12px', borderRadius: 'var(--r-sm)', fontSize: 12, maxWidth: 360, lineHeight: 1.5, whiteSpace: 'normal', pointerEvents: 'none', transform: 'translateY(-100%) translateY(-6px)' }}>
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
            )}

            {fetchStats?.diagnostics && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '8px 14px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 550, color: 'var(--ink-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Diagnostics</div>
                <pre style={{ margin: 0, padding: '14px 16px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-700)', background: 'var(--surface)', overflowX: 'auto' as const }}>
                  {JSON.stringify(fetchStats.diagnostics, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ height: 80 }} />
          </>
        )}

        <div style={{ position: 'fixed', bottom: 0, left: 224, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setStep('keywords')} style={S.btnSecondary}>← Retour</button>
            {!fetchingThreads && (
              <div style={{ fontSize: 13, color: 'var(--ink-600)' }}>
                <strong style={{ color: 'var(--ink-900)' }}>{selectedCount}</strong> conversation{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''} sur {threads.length}
              </div>
            )}
          </div>
          <button onClick={analyze} disabled={selectedCount === 0 || fetchingThreads}
            style={{ padding: '10px 28px', borderRadius: 'var(--r-sm)', background: selectedCount === 0 || fetchingThreads ? 'var(--surface-sunken)' : 'var(--accent)', color: selectedCount === 0 || fetchingThreads ? 'var(--ink-500)' : '#fff', border: selectedCount === 0 || fetchingThreads ? '1px solid var(--border)' : 'none', fontSize: 14, fontWeight: 550, cursor: selectedCount === 0 || fetchingThreads ? 'default' : 'pointer' }}>
            Analyser et configurer mon IA ({selectedCount})
          </button>
        </div>
      </div>
    )
  }

  // ── Étape 4 : Analyse en cours ────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
      <StepIndicator />
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>✦</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 8 }}>Analyse en cours…</div>
        <div style={{ fontSize: 14, color: 'var(--ink-500)', lineHeight: 1.6 }}>
          Robin analyse vos échanges et génère les règles de communication. Cette opération prend 1 à 2 minutes.
        </div>
        {error && (
          <div style={{ marginTop: 20, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--r-sm)', fontSize: 13, color: '#B91C1C' }}>{error}</div>
        )}
      </div>
    </div>
  )
}

const S = {
  th: { padding: '8px 12px', fontSize: 11, fontWeight: 550, color: 'var(--ink-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } as React.CSSProperties,
  td: { padding: '9px 12px', color: 'var(--ink-800)', verticalAlign: 'middle' as const } as React.CSSProperties,
  btnPrimary: { padding: '10px 24px', borderRadius: 'var(--r-sm)', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 550, cursor: 'pointer' } as React.CSSProperties,
  btnSecondary: { padding: '6px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--ink-700)', cursor: 'pointer' } as React.CSSProperties,
  btnDanger: { padding: '6px 14px', borderRadius: 'var(--r-sm)', border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 13, color: '#B91C1C', cursor: 'pointer' } as React.CSSProperties,
}
