import type { DirectionMessage, NiveauUrgence, StatutDemande } from '@/types/domain'

// PR2 — délai par défaut pour la transition R2 (EN_COURS → ATTENTE_CLIENT).
// Surchargeable par restaurant via RegleIA.config.delaiAttenteClientJours.
export const DEFAULT_DELAI_ATTENTE_CLIENT_JOURS = 7

export function readDelaiAttenteClientJours(config: unknown): number {
  if (config && typeof config === 'object') {
    const v = (config as { delaiAttenteClientJours?: unknown }).delaiAttenteClientJours
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  }
  return DEFAULT_DELAI_ATTENTE_CLIENT_JOURS
}

// PR2 — calcul unread (pas un champ dérivé DB, lecture seule).
export function isUnread(d: {
  lastMessageDirection: DirectionMessage | null
  lastMessageAt: Date | null
  lastSeenByAssigneeAt: Date | null
}): boolean {
  if (d.lastMessageDirection !== 'IN' || !d.lastMessageAt) return false
  if (!d.lastSeenByAssigneeAt) return true
  return d.lastSeenByAssigneeAt.getTime() < d.lastMessageAt.getTime()
}

export interface UrgenceInput {
  statut: StatutDemande
  dateEvenement: Date | null
  now: Date
  lastMessageAt: Date | null
  lastMessageDirection: DirectionMessage | null
  // PR2 — pastille unread. Un message client non vu fait remonter la demande
  // tout en haut de sa colonne, indépendamment du silenceCoteNous (qui mesure
  // le temps écoulé sans réponse — signal continu, plus subtil).
  // Optionnel pour rétrocompat avec les call-sites legacy qui ne le passent pas.
  hasUnread?: boolean
}

// PR2 — boost binaire choisi pour dépasser largement l'amplitude max
// (proximite=100 + silence=100) * mult=1.5 = 150. 10000 garantit la
// dominance même contre un score saturé.
export const UNREAD_BOOST = 10000

export interface UrgenceResult {
  score: number
  level: NiveauUrgence
  breakdown: {
    proximiteEvenement: number
    silenceCoteNous: number
    statutMultiplier: number
    unreadBoost: number
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
  const { statut, dateEvenement, now, lastMessageAt, lastMessageDirection, hasUnread } = input

  const statutMultiplier = MULTIPLICATEURS[statut] ?? 0

  if (statutMultiplier === 0) {
    // ANNULEE / PERDUE / CONFIRMEE : statut terminal — le boost unread ne
    // s'applique pas (sinon une demande terminée avec un IN non vu remonterait
    // le kanban). R4 fait basculer CONFIRMEE → EN_COURS sur réception IN, donc
    // en pratique on n'a pas d'unread sur statut terminal.
    return { score: 0, level: 'fresh', breakdown: { proximiteEvenement: 0, silenceCoteNous: 0, statutMultiplier: 0, unreadBoost: 0 } }
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

  const baseScore = Math.round(
    (proximiteEvenement * 0.5 + silenceCoteNous * 0.5) * statutMultiplier
  )
  const unreadBoost = hasUnread ? UNREAD_BOOST : 0
  const score = baseScore + unreadBoost

  const level: NiveauUrgence = score > 60 ? 'hot' : score >= 30 ? 'warn' : 'fresh'

  return { score, level, breakdown: { proximiteEvenement, silenceCoteNous, statutMultiplier, unreadBoost } }
}
