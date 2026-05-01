'use client'

import { useState } from 'react'
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

export default function KanbanBoard({ demandes, focusedId, onCardClick }: Props) {
  const [variant, setVariant] = useState<'classic' | 'dense'>('classic')

  const byStatut = (statut: StatutDemande) =>
    demandes
      .filter(d => d.statut === statut)
      .sort((a, b) => {
        // PR2 — primary: urgenceScore desc (boost unread déjà inclus côté serveur).
        if (b.urgenceScore !== a.urgenceScore) return b.urgenceScore - a.urgenceScore
        // PR2 — tie-breaker: dateEvenement ASC NULLS LAST.
        if (!a.dateEvenement && !b.dateEvenement) return 0
        if (!a.dateEvenement) return 1
        if (!b.dateEvenement) return -1
        return new Date(a.dateEvenement).getTime() - new Date(b.dateEvenement).getTime()
      })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
        {COLONNES.map(col => {
          const cards = byStatut(col.statut)
          return (
            <div key={col.statut} style={{
              background: 'var(--surface-sunken)',
              borderRadius: 'var(--r-md)',
              display: 'flex', flexDirection: 'column',
              minHeight: 0, border: '1px solid var(--hairline)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 14px 10px',
                borderBottom: '1px dashed var(--border)',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: col.dot, display: 'inline-block', flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>
                  {col.label}
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
                  <DemandeCard
                    key={d.id}
                    demande={d}
                    focused={d.id === focusedId}
                    dense={variant === 'dense'}
                    onClick={onCardClick ? () => onCardClick(d) : undefined}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
