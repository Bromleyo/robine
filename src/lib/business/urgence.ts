import type { DirectionMessage, NiveauUrgence, StatutDemande } from '@/types/domain'

export interface UrgenceInput {
  statut: StatutDemande
  dateEvenement: Date | null
  now: Date
  lastMessageAt: Date | null
  lastMessageDirection: DirectionMessage | null
}

export interface UrgenceResult {
  score: number
  level: NiveauUrgence
  breakdown: {
    proximiteEvenement: number
    silenceCoteNous: number
    statutMultiplier: number
  }
}

const MULTIPLICATEURS: Record<StatutDemande, number> = {
  NOUVELLE: 1.5,
  EN_COURS: 1.0,
  ATTENTE_CLIENT: 0.7,
  CONFIRMEE: 0,
  ANNULEE: 0,
  PERDUE: 0,
}

export function calculerUrgenceDemande(input: UrgenceInput): UrgenceResult {
  const { statut, dateEvenement, now, lastMessageAt, lastMessageDirection } = input

  const statutMultiplier = MULTIPLICATEURS[statut] ?? 0

  if (statutMultiplier === 0) {
    return { score: 0, level: 'fresh', breakdown: { proximiteEvenement: 0, silenceCoteNous: 0, statutMultiplier: 0 } }
  }

  let proximiteEvenement = 0
  if (dateEvenement) {
    const joursAvant = (dateEvenement.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    proximiteEvenement = Math.max(0, 100 - joursAvant * 2)
  }

  let silenceCoteNous = 0
  if (lastMessageDirection === 'IN' && lastMessageAt) {
    const heures = (now.getTime() - lastMessageAt.getTime()) / (1000 * 60 * 60)
    silenceCoteNous = Math.min(100, heures * 2)
  }

  const score = Math.round(
    (proximiteEvenement * 0.5 + silenceCoteNous * 0.5) * statutMultiplier
  )

  const level: NiveauUrgence = score > 60 ? 'hot' : score >= 30 ? 'warn' : 'fresh'

  return { score, level, breakdown: { proximiteEvenement, silenceCoteNous, statutMultiplier } }
}
