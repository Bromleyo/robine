'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// PR6 — composant générique d'édition inline pour les champs structurés
// d'une demande. Affiche la valeur, clic → mode édition, Enter/Blur sauve,
// Escape annule. Optimistic update avec rollback si l'API échoue.
//
// Variants : text | number | date | select | chips
//
// Le caller fournit la `field` Prisma (key sur Demande) et la valeur courante.
// La sauvegarde déclenche PATCH /api/demandes/[id] avec { [field]: nextValue }.

type SelectOption = { value: string; label: string }

type BaseProps = {
  demandeId: string
  field: string
  label: string
  emptyLabel?: string
  onSaved?: () => void
}

export type InlineFieldProps =
  | (BaseProps & { variant: 'text'; value: string | null; placeholder?: string; maxLength?: number })
  | (BaseProps & { variant: 'number'; value: number | null; min?: number; max?: number; placeholder?: string })
  | (BaseProps & { variant: 'date'; value: string | null /* ISO yyyy-mm-dd */ })
  | (BaseProps & { variant: 'time'; value: string | null /* HH:MM */ })
  | (BaseProps & { variant: 'select'; value: string | null; options: SelectOption[] })
  | (BaseProps & { variant: 'chips'; value: string[] })

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, color: 'var(--ink-400)', minWidth: 70, flexShrink: 0,
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13,
  color: 'var(--ink-700)', padding: '4px 0',
}
const valueStyle: React.CSSProperties = {
  flex: 1, cursor: 'text',
  padding: '2px 6px', margin: '-2px -6px',
  borderRadius: 4,
}
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '4px 8px',
  border: '1px solid var(--accent)',
  borderRadius: 4, fontSize: 13,
  background: 'var(--surface)',
  color: 'var(--ink-900)',
  fontFamily: 'inherit', outline: 'none',
}

export default function InlineField(props: InlineFieldProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  async function persist(payload: Record<string, unknown>): Promise<boolean> {
    setSaving(true)
    setError(false)
    try {
      const res = await fetch(`/api/demandes/${props.demandeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('PATCH failed')
      setSaving(false)
      router.refresh()
      props.onSaved?.()
      return true
    } catch {
      setSaving(false)
      setError(true)
      setTimeout(() => setError(false), 2500)
      return false
    }
  }

  if (props.variant === 'chips') {
    return (
      <ChipsField
        {...props}
        saving={saving}
        error={error}
        onChange={async (next) => persist({ [props.field]: next })}
      />
    )
  }

  if (!editing) {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>{props.label}</span>
        <span
          onClick={() => setEditing(true)}
          style={{
            ...valueStyle,
            color: hasValue(props) ? 'var(--ink-800)' : 'var(--ink-300)',
            fontStyle: hasValue(props) ? 'normal' : 'italic',
            background: error ? '#FEE2E2' : 'transparent',
          }}
          title="Cliquer pour modifier"
        >
          {displayValue(props)}
          {error && <span style={{ marginLeft: 6, fontSize: 11, color: '#9F1239' }}>échec</span>}
        </span>
      </div>
    )
  }

  return (
    <EditField
      {...props}
      saving={saving}
      onCancel={() => setEditing(false)}
      onCommit={async (raw) => {
        const next = parseValue(props, raw)
        if (next.kind === 'invalid') { setEditing(false); return }
        const ok = await persist({ [props.field]: next.value })
        if (ok) setEditing(false)
      }}
    />
  )
}

function hasValue(p: InlineFieldProps): boolean {
  if (p.variant === 'chips') return Array.isArray(p.value) && p.value.length > 0
  return p.value !== null && p.value !== undefined && p.value !== ''
}

function displayValue(p: InlineFieldProps): string {
  if (p.variant === 'chips') return Array.isArray(p.value) && p.value.length > 0 ? p.value.join(', ') : (p.emptyLabel ?? '—')
  if (p.value === null || p.value === undefined || p.value === '') return p.emptyLabel ?? '—'
  if (p.variant === 'select') {
    const opt = p.options.find(o => o.value === p.value)
    return opt?.label ?? String(p.value)
  }
  if (p.variant === 'date') {
    const d = new Date(p.value as string)
    if (Number.isNaN(d.getTime())) return String(p.value)
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  }
  return String(p.value)
}

type ParseResult = { kind: 'ok'; value: unknown } | { kind: 'invalid' }

function parseValue(p: InlineFieldProps, raw: string): ParseResult {
  const trimmed = raw.trim()
  if (p.variant === 'text') {
    if (trimmed === (p.value ?? '')) return { kind: 'invalid' }
    return { kind: 'ok', value: trimmed === '' ? null : trimmed }
  }
  if (p.variant === 'number') {
    if (trimmed === '') return { kind: 'ok', value: null }
    const n = Number(trimmed)
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { kind: 'invalid' }
    if (n === p.value) return { kind: 'invalid' }
    return { kind: 'ok', value: n }
  }
  if (p.variant === 'date') {
    if (trimmed === '') return { kind: 'ok', value: null }
    if (trimmed === p.value) return { kind: 'invalid' }
    return { kind: 'ok', value: trimmed }
  }
  if (p.variant === 'time') {
    if (trimmed === '') return { kind: 'ok', value: null }
    if (!/^\d{2}:\d{2}$/.test(trimmed)) return { kind: 'invalid' }
    if (trimmed === p.value) return { kind: 'invalid' }
    return { kind: 'ok', value: trimmed }
  }
  if (p.variant === 'select') {
    const next = trimmed === '' ? null : trimmed
    if (next === p.value) return { kind: 'invalid' }
    return { kind: 'ok', value: next }
  }
  return { kind: 'invalid' }
}

interface EditFieldProps {
  variant: InlineFieldProps['variant']
  value: unknown
  label: string
  saving: boolean
  options?: SelectOption[]
  min?: number
  max?: number
  placeholder?: string
  maxLength?: number
  onCommit: (raw: string) => void
  onCancel: () => void
}

function EditField(props: EditFieldProps) {
  const ref = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const [draft, setDraft] = useState<string>(() => {
    if (props.value === null || props.value === undefined) return ''
    return String(props.value)
  })

  useEffect(() => { ref.current?.focus() }, [])

  function commit() { props.onCommit(draft) }
  function key(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && props.variant !== 'text') commit()
    if (e.key === 'Escape') props.onCancel()
  }

  if (props.variant === 'select') {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>{props.label}</span>
        <select
          ref={ref as React.RefObject<HTMLSelectElement>}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); props.onCommit(e.target.value) }}
          onBlur={commit}
          onKeyDown={key}
          disabled={props.saving}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {(props.options ?? []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    )
  }

  const inputType = props.variant === 'number' ? 'number'
    : props.variant === 'date' ? 'date'
    : props.variant === 'time' ? 'time'
    : 'text'

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{props.label}</span>
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type={inputType}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') props.onCancel() }}
        onBlur={commit}
        disabled={props.saving}
        min={props.min}
        max={props.max}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        style={inputStyle}
      />
    </div>
  )
}

interface ChipsFieldProps {
  label: string
  value: string[]
  emptyLabel?: string
  saving: boolean
  error: boolean
  onChange: (next: string[]) => Promise<boolean>
}

function ChipsField(props: ChipsFieldProps) {
  const [draft, setDraft] = useState('')

  async function add() {
    const v = draft.trim().toLowerCase()
    if (!v) return
    if (props.value.includes(v)) { setDraft(''); return }
    const next = [...props.value, v]
    const ok = await props.onChange(next)
    if (ok) setDraft('')
  }

  async function remove(v: string) {
    const next = props.value.filter(x => x !== v)
    await props.onChange(next)
  }

  return (
    <div style={{ ...rowStyle, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <span style={labelStyle}>{props.label}</span>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {props.value.length === 0 && (
          <span style={{ color: 'var(--ink-300)', fontStyle: 'italic', fontSize: 13 }}>
            {props.emptyLabel ?? 'Aucun'}
          </span>
        )}
        {props.value.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '1px 4px 1px 8px', fontSize: 12,
            background: 'var(--surface-sunken)', color: 'var(--ink-700)',
            border: '1px solid var(--border)', borderRadius: 12,
          }}>
            {v}
            <button
              onClick={() => void remove(v)}
              disabled={props.saving}
              aria-label={`Retirer ${v}`}
              style={{
                background: 'none', border: 'none', cursor: props.saving ? 'wait' : 'pointer',
                color: 'var(--ink-400)', fontSize: 14, lineHeight: 1, padding: '0 2px',
              }}
            >×</button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
          onBlur={() => { if (draft.trim()) void add() }}
          disabled={props.saving}
          placeholder="+ régime"
          maxLength={60}
          style={{
            border: 'none', background: 'transparent',
            fontSize: 12.5, color: 'var(--ink-700)',
            padding: '2px 4px', outline: 'none',
            fontFamily: 'inherit', minWidth: 90,
          }}
        />
        {props.error && (
          <span style={{ fontSize: 11, color: '#9F1239' }}>échec</span>
        )}
      </div>
    </div>
  )
}
