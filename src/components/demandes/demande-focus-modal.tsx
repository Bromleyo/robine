'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/icon'
import ReplyForm from '@/components/detail/reply-form'

type ContactJson = {
  id: string; nom: string; email: string; societe?: string | null; telephone?: string | null
  nbDemandesTotal: number; nbDemandesConfirmees: number
}
type MessageJson = {
  id: string; direction: 'IN' | 'OUT'
  fromName?: string | null; fromEmail: string
  bodyText?: string | null; bodyHtml: string
  sentAt?: string | null; receivedAt?: string | null
}
type DemandeJson = {
  id: string; reference: string; statut: string
  typeEvenement?: string | null; dateEvenement?: string | null
  heureDebut?: string | null; heureFin?: string | null
  nbInvites?: number | null; budgetIndicatifCents?: number | null
  contraintesAlimentaires: string[]
  contact: ContactJson
  espace?: { nom: string } | null
  threads: Array<{ id: string; messages: MessageJson[] }>
}
type MenuJson = {
  id: string; nom: string; description?: string | null
  prixCents: number; regimesSupportes: string[]
  minConvives?: number | null; maxConvives?: number | null
  serviceType: string
  choixUniqueDispo: boolean; choixUniqueMinPax: number | null
  choixMultipleDispo: boolean; choixMultipleMinPax: number | null
  pdfUrl: string | null
}
type TemplateJson = {
  id: string; nom: string; objectif: string; bodyTemplate: string
}
interface ModalData { demande: DemandeJson; menus: MenuJson[]; templates: TemplateJson[] }

interface Props {
  demandeId: string | null
  onClose: () => void
}

const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise", ANNIVERSAIRE: 'Anniversaire',
  SEMINAIRE: 'Séminaire', PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}
const OBJECTIF_ICON: Record<string, 'mail' | 'clock' | 'file' | 'check' | 'close'> = {
  PROPOSITION: 'mail', RELANCE: 'clock', DEVIS: 'file', CONFIRMATION: 'check', REFUS: 'close', AUTRE: 'mail',
}

function initials(nom: string) {
  return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
function formatDateTime(s: string | null | undefined) {
  if (!s) return null
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s))
}
function formatDate(s: string) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s))
}
function matchScore(menu: MenuJson, demande: DemandeJson): number | null {
  if (demande.nbInvites) {
    const seuilMin = Math.min(
      menu.choixUniqueDispo ? (menu.choixUniqueMinPax ?? 0) : Infinity,
      menu.choixMultipleDispo ? (menu.choixMultipleMinPax ?? 0) : Infinity,
    )
    if (seuilMin > 0 && demande.nbInvites < seuilMin) return null
  }
  let score = 100
  if (demande.budgetIndicatifCents) {
    const over = menu.prixCents - demande.budgetIndicatifCents
    if (over > 0) score -= Math.min(35, Math.floor(over / 400))
  }
  if (demande.nbInvites) {
    if (menu.maxConvives && demande.nbInvites > menu.maxConvives) score -= 30
  }
  if (demande.contraintesAlimentaires.length > 0) {
    const missed = demande.contraintesAlimentaires.filter(c => !menu.regimesSupportes.includes(c)).length
    score -= missed * 20
  }
  return Math.max(8, score)
}

type AIResult = { emailClient: string; panneauAdmin: string }

export default function DemandeFocusModal({ demandeId, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ModalData | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AIResult | null>(null)
  const [aiTab, setAiTab] = useState<'email' | 'admin'>('email')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!demandeId) { setData(null); return }
    setLoading(true)
    fetch(`/api/demandes/${demandeId}`)
      .then(r => r.json())
      .then(d => setData(d as ModalData))
      .finally(() => setLoading(false))
  }, [demandeId])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!demandeId) return null

  const allMessages = data?.demande.threads.flatMap(t => t.messages) ?? []
  const menusScored = data
    ? data.menus
        .map(m => ({ ...m, match: matchScore(m, data.demande) }))
        .filter((m): m is typeof m & { match: number } => m.match !== null)
        .sort((a, b) => b.match - a.match)
    : []

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(28,25,23,.38)',
        display: 'grid', placeItems: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1100px, 95vw)', height: 'min(740px, 92vh)',
          background: 'var(--surface)',
          borderRadius: 14,
          boxShadow: '0 40px 80px rgba(0,0,0,.25)',
          display: 'grid',
          gridTemplateColumns: loading || !data ? '1fr' : '1.25fr 1fr',
          overflow: 'hidden',
        }}
      >
        {loading && (
          <div style={{ display: 'grid', placeItems: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
            Chargement…
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── Left panel: thread + reply ── */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--border)' }}>

              {/* Header */}
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: data.demande.contact.societe ? '#8B5CF6' : '#0EA5E9',
                    color: '#fff', display: 'grid', placeItems: 'center',
                    fontSize: 13, fontWeight: 600, flexShrink: 0,
                  }}>{initials(data.demande.contact.nom)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{data.demande.contact.nom}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[
                        data.demande.contact.societe,
                        data.demande.typeEvenement ? (EVENT_LABEL[data.demande.typeEvenement] ?? data.demande.typeEvenement) : null,
                        data.demande.dateEvenement ? formatDate(data.demande.dateEvenement) : null,
                        data.demande.nbInvites ? `${data.demande.nbInvites} pers.` : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Link
                    href={`/demandes/${data.demande.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12, color: 'var(--ink-600)', textDecoration: 'none',
                      padding: '5px 9px', borderRadius: 6,
                      background: 'var(--surface-sunken)', border: '1px solid var(--border)',
                      marginRight: 4, flexShrink: 0,
                    }}
                  >
                    Fiche complète <Icon name="arrow_right" size={11} />
                  </Link>
                  <button
                    onClick={onClose}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-400)', display: 'grid', placeItems: 'center',
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    }}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)', background: 'var(--surface-sunken)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                    {data.demande.reference}
                  </span>
                  {data.demande.espace && (
                    <span style={{ fontSize: 12, color: 'var(--ink-600)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="pin" size={11} />{data.demande.espace.nom}
                    </span>
                  )}
                  {data.demande.budgetIndicatifCents && (
                    <span style={{ fontSize: 12, color: 'var(--ink-600)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="euro" size={11} />~{Math.round(data.demande.budgetIndicatifCents / 100)} €/pers.
                    </span>
                  )}
                  {data.demande.contraintesAlimentaires.length > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--ink-600)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="check" size={11} />{data.demande.contraintesAlimentaires.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Thread */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {allMessages.length === 0 && (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--ink-300)', fontSize: 13 }}>
                    <div style={{ textAlign: 'center' }}>
                      <Icon name="mail" size={26} />
                      <div style={{ marginTop: 8 }}>Aucun message</div>
                    </div>
                  </div>
                )}
                {allMessages.map(msg => {
                  const isOut = msg.direction === 'OUT'
                  const ts = formatDateTime(isOut ? msg.sentAt : msg.receivedAt)
                  const body = (msg.bodyText ?? msg.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start', gap: 3 }}>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-400)', display: 'flex', gap: 5, alignItems: 'center' }}>
                        <span style={{ fontWeight: 550 }}>{isOut ? 'Vous' : (msg.fromName ?? msg.fromEmail)}</span>
                        {ts && <span>{ts}</span>}
                      </div>
                      <div style={{
                        maxWidth: '82%',
                        background: isOut ? 'var(--accent-soft)' : 'var(--surface-sunken)',
                        border: `1px solid ${isOut ? '#FCE7EB' : 'var(--border)'}`,
                        borderRadius: isOut ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                        padding: '8px 12px', fontSize: 13, lineHeight: 1.55,
                        color: 'var(--ink-900)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>{body}</div>
                    </div>
                  )
                })}
              </div>

              {/* Reply form */}
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--surface)', flexShrink: 0 }}>
                <ReplyForm demandeId={data.demande.id} />
              </div>
            </div>

            {/* ── Right panel: details + menus + templates ── */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

              {/* Détails & Historique */}
              <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-700)' }}>
                  Détails & Historique
                </span>

                {/* Event details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                  {([
                    { label: 'Type', value: data.demande.typeEvenement ? (EVENT_LABEL[data.demande.typeEvenement] ?? data.demande.typeEvenement) : null },
                    { label: 'Date', value: data.demande.dateEvenement ? formatDate(data.demande.dateEvenement) : null },
                    { label: 'Horaire', value: (data.demande.heureDebut || data.demande.heureFin) ? [data.demande.heureDebut, data.demande.heureFin].filter(Boolean).join(' – ') : null },
                    { label: 'Invités', value: data.demande.nbInvites ? `${data.demande.nbInvites} personnes` : null },
                    { label: 'Budget', value: data.demande.budgetIndicatifCents ? `~${Math.round(data.demande.budgetIndicatifCents / 100)} €/pers.` : null },
                    { label: 'Espace', value: data.demande.espace?.nom ?? null },
                    { label: 'Régimes', value: data.demande.contraintesAlimentaires.length > 0 ? data.demande.contraintesAlimentaires.join(', ') : null },
                  ] as { label: string; value: string | null }[]).map((row) => (
                    <div key={row.label} style={{ display: 'flex', gap: 6, fontSize: 12.5, lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--ink-400)', flexShrink: 0, minWidth: 52 }}>{row.label}</span>
                      <span style={{ color: row.value ? 'var(--ink-800)' : 'var(--ink-300)', fontWeight: row.value ? 500 : 400 }}>
                        {row.value ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Contact history */}
                <div style={{
                  marginTop: 12, display: 'flex', gap: 0,
                  background: 'var(--surface-sunken)', borderRadius: 8,
                  border: '1px solid var(--hairline)', overflow: 'hidden',
                }}>
                  {[
                    { value: data.demande.contact.nbDemandesTotal, label: 'demande' + (data.demande.contact.nbDemandesTotal !== 1 ? 's' : ''), color: 'var(--ink-900)' },
                    { value: data.demande.contact.nbDemandesConfirmees, label: 'confirmée' + (data.demande.contact.nbDemandesConfirmees !== 1 ? 's' : ''), color: '#059669' },
                    ...(data.demande.contact.nbDemandesTotal > 0 ? [{
                      value: `${Math.round((data.demande.contact.nbDemandesConfirmees / data.demande.contact.nbDemandesTotal) * 100)}%`,
                      label: 'conversion', color: 'var(--ink-900)',
                    }] : []),
                  ].map((stat, i, arr) => (
                    <div key={stat.label} style={{
                      flex: 1, padding: '8px 10px', textAlign: 'center',
                      borderRight: i < arr.length - 1 ? '1px solid var(--hairline)' : 'none',
                    }}>
                      <div style={{ fontSize: 17, fontWeight: 650, color: stat.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{stat.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 3 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Menus suggérés */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '14px 18px 10px',
                borderBottom: '1px solid var(--hairline)',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-700)' }}>Menus suggérés</span>
                <span style={{ fontSize: 11, color: 'var(--ink-500)', background: 'var(--surface-sunken)', padding: '1px 7px', borderRadius: 10, border: '1px solid var(--border)' }}>
                  {menusScored.length}
                </span>
                {(data.demande.nbInvites || data.demande.budgetIndicatifCents || data.demande.contraintesAlimentaires.length > 0) && (
                  <span style={{ fontSize: 10.5, color: 'var(--ink-400)', marginLeft: 'auto' }}>
                    {[
                      data.demande.nbInvites && `${data.demande.nbInvites} pers.`,
                      data.demande.budgetIndicatifCents && `~${Math.round(data.demande.budgetIndicatifCents / 100)} €`,
                      ...data.demande.contraintesAlimentaires,
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>

              {menusScored.length === 0 ? (
                <div style={{ padding: '20px 18px', fontSize: 12.5, color: 'var(--ink-400)', textAlign: 'center' }}>
                  Aucun menu configuré.{' '}
                  <Link href="/config/menus" style={{ color: 'var(--accent)', fontSize: 12 }}>Créer un menu →</Link>
                </div>
              ) : (
                <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {menusScored.slice(0, 4).map((menu, i) => (
                    <div key={menu.id} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      background: 'var(--surface-sunken)', borderRadius: 8,
                      padding: '10px 12px', border: '1px solid var(--hairline)',
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 6,
                        background: i === 0 ? 'var(--accent-soft)' : 'var(--border)',
                        flexShrink: 0, display: 'grid', placeItems: 'center',
                        color: i === 0 ? 'var(--accent)' : 'var(--ink-400)',
                      }}>
                        <Icon name="menu" size={15} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{menu.nom}</span>
                          {i === 0 && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Recommandé
                            </span>
                          )}
                        </div>
                        {menu.description && (
                          <div style={{ fontSize: 11.5, color: 'var(--ink-600)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {menu.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{Math.round(menu.prixCents / 100)} €</span>
                          <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>/ pers.</span>
                          {menu.regimesSupportes.slice(0, 2).map(r => (
                            <span key={r} style={{ fontSize: 10.5, background: 'var(--surface)', padding: '1px 6px', borderRadius: 10, color: 'var(--ink-600)', border: '1px solid var(--border)' }}>{r}</span>
                          ))}
                          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-500)', flexShrink: 0 }}>
                            <span style={{ display: 'inline-block', width: 36, height: 4, borderRadius: 2, background: 'var(--border)', verticalAlign: 'middle', overflow: 'hidden', position: 'relative' }}>
                              <span style={{
                                display: 'block', height: '100%', width: `${menu.match}%`,
                                background: menu.match >= 80 ? '#10B981' : menu.match >= 55 ? '#F59E0B' : 'var(--accent)',
                                position: 'absolute', top: 0, left: 0,
                              }} />
                            </span>
                            {menu.match}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Modèles rapides */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 18px 10px',
                borderTop: '1px solid var(--hairline)',
                borderBottom: '1px solid var(--hairline)',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-700)' }}>Modèles rapides</span>
                <span style={{ fontSize: 11, color: 'var(--ink-500)', background: 'var(--surface-sunken)', padding: '1px 7px', borderRadius: 10, border: '1px solid var(--border)' }}>
                  {data.templates.length}
                </span>
              </div>

              {data.templates.length === 0 ? (
                <div style={{ padding: '16px 18px', fontSize: 12.5, color: 'var(--ink-400)', textAlign: 'center' }}>
                  Aucun modèle configuré.{' '}
                  <Link href="/config/templates" style={{ color: 'var(--accent)', fontSize: 12 }}>Créer un modèle →</Link>
                </div>
              ) : (
                <div style={{ padding: '10px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {data.templates.slice(0, 4).map(tpl => (
                    <div key={tpl.id} style={{
                      background: 'var(--surface-sunken)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 550, color: 'var(--ink-800)', marginBottom: 4 }}>
                        <Icon name={OBJECTIF_ICON[tpl.objectif] ?? 'mail'} size={11} />
                        {tpl.nom}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-500)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tpl.bodyTemplate}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Réponse IA ── */}
              <div style={{ padding: '12px 18px 20px', marginTop: 'auto', borderTop: '1px solid var(--hairline)' }}>
                {!aiResult ? (
                  <button
                    onClick={async () => {
                      setAiLoading(true)
                      try {
                        const res = await fetch(`/api/demandes/${data.demande.id}/generer-reponse`, { method: 'POST' })
                        const json = await res.json() as AIResult
                        setAiResult(json)
                      } finally {
                        setAiLoading(false)
                      }
                    }}
                    disabled={aiLoading}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      width: '100%', padding: '9px 16px', borderRadius: 'var(--r-sm)',
                      background: aiLoading ? 'var(--surface-sunken)' : 'var(--accent-soft)',
                      border: '1px solid var(--border)',
                      fontSize: 13, fontWeight: 500,
                      color: aiLoading ? 'var(--ink-400)' : 'var(--accent)',
                      cursor: aiLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Icon name="sparkle" size={13} />
                    {aiLoading ? 'Génération en cours…' : 'Générer une réponse IA'}
                  </button>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        {(['email', 'admin'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setAiTab(tab)}
                            style={{
                              padding: '4px 10px', fontSize: 11.5, fontWeight: 550,
                              background: aiTab === tab ? 'var(--accent-soft)' : 'transparent',
                              color: aiTab === tab ? 'var(--accent)' : 'var(--ink-500)',
                              border: 'none', cursor: 'pointer',
                            }}
                          >
                            {tab === 'email' ? 'Email client' : 'Panneau admin'}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(aiTab === 'email' ? aiResult.emailClient : aiResult.panneauAdmin)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                        }}
                        style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-sunken)', cursor: 'pointer', color: 'var(--ink-600)' }}
                      >
                        {copied ? 'Copié ✓' : 'Copier'}
                      </button>
                      <button
                        onClick={() => setAiResult(null)}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-sunken)', cursor: 'pointer', color: 'var(--ink-500)' }}
                      >
                        Regénérer
                      </button>
                    </div>
                    <div style={{
                      fontSize: 12, lineHeight: 1.6, color: 'var(--ink-800)',
                      background: 'var(--surface-sunken)', borderRadius: 7,
                      border: '1px solid var(--border)', padding: '10px 12px',
                      maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {aiTab === 'email' ? aiResult.emailClient : aiResult.panneauAdmin}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
