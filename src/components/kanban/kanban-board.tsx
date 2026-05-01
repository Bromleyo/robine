'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useRouter } from 'next/navigation'
import type { DemandeEnriched, StatutDemande } from '@/types/domain'
import DemandeCard from './demande-card'
import Icon from '@/components/ui/icon'

const COLONNES: { statut: StatutDemande; label: string; dot: string }[] = [
  { statut: 'NOUVELLE',       label: 'Nouvelles',     dot: '#6366F1' },
  { statut: 'EN_COURS',       label: 'En cours',       dot: '#F59E0B' },
  { statut: 'ATTENTE_CLIENT', label: 'Attente client', dot: '#9F1239' },
  { statut: 'CONFIRMEE',      label: 'Confirmées',     dot: '#10B981' },
]

interface Props {
  demandes: DemandeEnriched[]
  focusedId?: string
  onCardClick?: (demande: DemandeEnriched) => void
}

interface Toast { type: 'ok' | 'err'; msg: string }

export default function KanbanBoard({ demandes, focusedId, onCardClick }: Props) {
  const router = useRouter()
  const [variant, setVariant] = useState<'classic' | 'dense'>('classic')

  // PR6 — overrides locaux de statut pendant l'optimistic update.
  // Une entrée { demandeId → newStatut } est ajoutée au drop, retirée
  // au router.refresh() (déclenché en succès) ou en rollback (échec).
  const [overrides, setOverrides] = useState<Map<string, StatutDemande>>(new Map())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  // Quand le SSR re-fetch les demandes, les overrides sont obsolètes.
  useEffect(() => { setOverrides(new Map()) }, [demandes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const effectiveDemandes = useMemo(() => {
    if (overrides.size === 0) return demandes
    return demandes.map(d => {
      const o = overrides.get(d.id)
      return o ? { ...d, statut: o } : d
    })
  }, [demandes, overrides])

  const byStatut = (statut: StatutDemande) =>
    effectiveDemandes
      .filter(d => d.statut === statut)
      .sort((a, b) => {
        if (b.urgenceScore !== a.urgenceScore) return b.urgenceScore - a.urgenceScore
        if (!a.dateEvenement && !b.dateEvenement) return 0
        if (!a.dateEvenement) return 1
        if (!b.dateEvenement) return -1
        return new Date(a.dateEvenement).getTime() - new Date(b.dateEvenement).getTime()
      })

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(null), 3000)
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const demandeId = String(active.id)
    const targetStatut = String(over.id) as StatutDemande
    const card = effectiveDemandes.find(d => d.id === demandeId)
    if (!card) return
    if (card.statut === targetStatut) return // no-op intra-colonne

    // Optimistic
    setOverrides(prev => {
      const m = new Map(prev)
      m.set(demandeId, targetStatut)
      return m
    })

    try {
      const res = await fetch(`/api/demandes/${demandeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: targetStatut }),
      })
      if (!res.ok) throw new Error('PATCH failed')
      router.refresh()
    } catch {
      // Rollback
      setOverrides(prev => {
        const m = new Map(prev)
        m.delete(demandeId)
        return m
      })
      showToast({ type: 'err', msg: 'Échec : statut non sauvegardé.' })
    }
  }

  const activeCard = activeId ? effectiveDemandes.find(d => d.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '8px 16px', margin: '8px 24px 0',
              fontSize: 13, fontWeight: 500,
              background: toast.type === 'ok' ? '#DCFCE7' : '#FEE2E2',
              color: toast.type === 'ok' ? '#166534' : '#9F1239',
              border: `1px solid ${toast.type === 'ok' ? '#BBF7D0' : '#FECACA'}`,
              borderRadius: 'var(--r-sm)',
            }}
          >{toast.msg}</div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 24px 0' }}>
          <div style={{
            display: 'inline-flex',
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--r-sm)',
            padding: 2,
          }}>
            {(['classic', 'dense'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12, fontWeight: 500,
                  borderRadius: 4,
                  background: variant === v ? 'var(--surface)' : 'transparent',
                  color: variant === v ? 'var(--ink-900)' : 'var(--ink-500)',
                  boxShadow: variant === v ? '0 1px 2px rgba(28,25,23,.04)' : 'none',
                  cursor: 'pointer', border: 'none',
                  transition: 'all .1s',
                }}
              >
                {v === 'classic' ? 'A · Classique' : 'B · Dense'}
              </button>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div style={{
          flex: 1,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16, padding: '12px 24px 20px',
          overflow: 'hidden', minHeight: 0,
        }}>
          {COLONNES.map(col => (
            <DroppableColumn
              key={col.statut}
              colonne={col}
              cards={byStatut(col.statut)}
              variant={variant}
              focusedId={focusedId}
              activeId={activeId}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div style={{ opacity: 0.95, cursor: 'grabbing' }}>
            <DemandeCard demande={activeCard} dense={variant === 'dense'} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

interface DroppableColumnProps {
  colonne: { statut: StatutDemande; label: string; dot: string }
  cards: DemandeEnriched[]
  variant: 'classic' | 'dense'
  focusedId?: string
  activeId: string | null
  onCardClick?: (demande: DemandeEnriched) => void
}

function DroppableColumn({ colonne, cards, variant, focusedId, activeId, onCardClick }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: colonne.statut })

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'var(--accent-soft)' : 'var(--surface-sunken)',
        borderRadius: 'var(--r-md)',
        display: 'flex', flexDirection: 'column',
        minHeight: 0,
        border: `1px ${isOver ? 'solid var(--accent)' : 'solid var(--hairline)'}`,
        transition: 'background .12s, border-color .12s',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px 10px',
        borderBottom: '1px dashed var(--border)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: colonne.dot, display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>
          {colonne.label}
        </span>
        <span style={{
          fontSize: 11.5, color: 'var(--ink-500)',
          background: 'var(--surface)', padding: '1px 7px',
          borderRadius: 10, border: '1px solid var(--border)',
        }}>{cards.length}</span>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '8px 8px 14px',
        display: 'flex', flexDirection: 'column',
        gap: variant === 'dense' ? 5 : 8,
      }}>
        {cards.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '28px 12px', gap: 8, color: 'var(--ink-300)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'grid', placeItems: 'center',
            }}>
              <Icon name="inbox" size={16} />
            </div>
            <span style={{ fontSize: 12 }}>Aucune demande</span>
          </div>
        )}
        {cards.map(d => (
          <DraggableCard
            key={d.id}
            demande={d}
            focused={d.id === focusedId}
            dense={variant === 'dense'}
            hidden={activeId === d.id}
            onClick={onCardClick ? () => onCardClick(d) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

interface DraggableCardProps {
  demande: DemandeEnriched
  focused: boolean
  dense: boolean
  hidden: boolean
  onClick?: () => void
}

function DraggableCard({ demande, focused, dense, hidden, onClick }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: demande.id })

  // Pas de transform local : DragOverlay fait le rendu pendant le drag.
  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: hidden || isDragging ? 0.35 : 1,
        cursor: 'grab',
        touchAction: 'none',
      }}
      {...listeners}
      {...attributes}
    >
      <DemandeCard
        demande={demande}
        focused={focused}
        dense={dense}
        onClick={onClick}
      />
    </div>
  )
}
