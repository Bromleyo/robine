'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/icon'
import { renderTemplate } from '@/lib/templates/render'

interface Template { id: string; nom: string; bodyTemplate: string }

interface Props {
  demandeId: string
  templates?: Template[]
  context?: Record<string, string>
}

export default function ReplyForm({ demandeId, templates, context }: Props) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [instruction, setInstruction] = useState('')
  const [showInstruction, setShowInstruction] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    setError('')

    const res = await fetch(`/api/demandes/${demandeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? "Erreur lors de l'envoi")
    } else {
      setBody('')
      setInstruction('')
      setShowInstruction(false)
      router.refresh()
    }
    setSending(false)
  }

  async function generateDraft() {
    setGenerating(true)
    setError('')
    const res = await fetch(`/api/demandes/${demandeId}/ai-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        instruction.trim() && body.trim()
          ? { instruction: instruction.trim(), previousDraft: body }
          : {}
      ),
    })
    if (res.ok) {
      const data = await res.json() as { draft?: string }
      if (data.draft) {
        setBody(data.draft)
        setShowInstruction(true)
      }
    } else {
      setError('Erreur lors de la génération IA')
    }
    setGenerating(false)
  }

  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 'var(--r-sm)',
    fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
    transition: 'background .1s',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--ink-400)',
          }}>Répondre</div>
          {templates && templates.length > 0 && (
            <select
              defaultValue=""
              onChange={e => {
                const tpl = templates.find(t => t.id === e.target.value)
                if (tpl) setBody(renderTemplate(tpl.bodyTemplate, context ?? {}))
                e.target.value = ''
              }}
              style={{
                padding: '4px 8px', fontSize: 12,
                border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                background: 'var(--surface-sunken)', color: 'var(--ink-700)',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <option value="">Modèle…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={generateDraft}
          disabled={generating}
          style={{
            ...btnBase,
            background: 'var(--surface-sunken)',
            color: generating ? 'var(--ink-400)' : 'var(--ink-700)',
          }}
        >
          <Icon name="sparkle" size={13} />
          {generating ? 'Génération…' : body.trim() ? 'Regénérer' : 'Générer avec IA'}
        </button>
      </div>

      {/* Body textarea */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Votre réponse… ou cliquez sur « Générer avec IA »"
        rows={6}
        style={{
          width: '100%', resize: 'vertical',
          padding: '10px 12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          fontSize: 13.5, color: 'var(--ink-900)',
          fontFamily: 'inherit', lineHeight: 1.55,
          outline: 'none',
        }}
      />

      {/* AI instruction row — shown after first generation */}
      {showInstruction && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="Demander une modification : ex. « Ajouter une option végétarienne »"
            style={{
              flex: 1, padding: '7px 11px',
              border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
              fontSize: 13, fontFamily: 'inherit',
              background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none',
            }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void generateDraft() } }}
          />
          <button
            type="button"
            onClick={generateDraft}
            disabled={generating || !instruction.trim()}
            style={{
              ...btnBase,
              background: generating || !instruction.trim() ? 'var(--surface-sunken)' : 'var(--ink-900)',
              color: generating || !instruction.trim() ? 'var(--ink-400)' : '#fff',
            }}
          >
            <Icon name="sparkle" size={12} />
            {generating ? '…' : 'Appliquer'}
          </button>
        </div>
      )}

      {error && (
        <p style={{
          fontSize: 12, color: 'var(--accent)',
          background: 'var(--accent-soft)', borderRadius: 6,
          padding: '6px 10px', margin: 0,
        }}>{error}</p>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {body.trim() && !showInstruction && (
          <button
            type="button"
            onClick={() => setShowInstruction(true)}
            style={{ ...btnBase, background: 'transparent', color: 'var(--ink-500)' }}
          >
            <Icon name="sparkle" size={12} />
            Modifier avec IA
          </button>
        )}
        <button
          type="submit"
          disabled={sending || !body.trim()}
          style={{
            ...btnBase,
            padding: '8px 16px',
            background: sending || !body.trim() ? 'var(--border)' : 'var(--accent)',
            color: sending || !body.trim() ? 'var(--ink-400)' : '#fff',
            cursor: sending || !body.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          <Icon name="send" size={13} />
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </form>
  )
}
