import { describe, it, expect } from 'vitest'
import {
  calculerUrgenceDemande,
  isUnread,
  readDelaiAttenteClientJours,
  DEFAULT_DELAI_ATTENTE_CLIENT_JOURS,
  UNREAD_BOOST,
} from './urgence'

const NOW = new Date('2025-06-01T10:00:00Z')

describe('calculerUrgenceDemande', () => {
  it('returns score 0 for CONFIRMEE', () => {
    const result = calculerUrgenceDemande({
      statut: 'CONFIRMEE', dateEvenement: new Date('2025-06-10T00:00:00Z'),
      now: NOW, lastMessageAt: NOW, lastMessageDirection: 'IN',
    })
    expect(result.score).toBe(0)
    expect(result.level).toBe('fresh')
  })

  it('returns score 0 for ANNULEE', () => {
    const result = calculerUrgenceDemande({
      statut: 'ANNULEE', dateEvenement: new Date('2025-06-10T00:00:00Z'),
      now: NOW, lastMessageAt: NOW, lastMessageDirection: 'IN',
    })
    expect(result.score).toBe(0)
  })

  it('returns score 0 for PERDUE', () => {
    const result = calculerUrgenceDemande({
      statut: 'PERDUE', dateEvenement: new Date('2025-06-02T00:00:00Z'),
      now: NOW, lastMessageAt: NOW, lastMessageDirection: 'IN',
    })
    expect(result.score).toBe(0)
  })

  it('level is hot when event is tomorrow and message unanswered 12h', () => {
    const tomorrow = new Date('2025-06-02T10:00:00Z')
    const twelveHoursAgo = new Date('2025-05-31T22:00:00Z')
    const result = calculerUrgenceDemande({
      statut: 'NOUVELLE', dateEvenement: tomorrow,
      now: NOW, lastMessageAt: twelveHoursAgo, lastMessageDirection: 'IN',
    })
    expect(result.score).toBeGreaterThan(60)
    expect(result.level).toBe('hot')
  })

  it('level is fresh when event is far away and last message was OUT', () => {
    const farFuture = new Date('2026-01-01T00:00:00Z')
    const result = calculerUrgenceDemande({
      statut: 'EN_COURS', dateEvenement: farFuture,
      now: NOW, lastMessageAt: NOW, lastMessageDirection: 'OUT',
    })
    expect(result.level).toBe('fresh')
    expect(result.breakdown.silenceCoteNous).toBe(0)
  })

  it('silence score is 0 when last direction is OUT', () => {
    const result = calculerUrgenceDemande({
      statut: 'NOUVELLE', dateEvenement: null,
      now: NOW, lastMessageAt: new Date('2025-05-01T00:00:00Z'), lastMessageDirection: 'OUT',
    })
    expect(result.breakdown.silenceCoteNous).toBe(0)
  })

  it('silence score caps at 100', () => {
    const longAgo = new Date('2025-01-01T00:00:00Z')
    const result = calculerUrgenceDemande({
      statut: 'EN_COURS', dateEvenement: null,
      now: NOW, lastMessageAt: longAgo, lastMessageDirection: 'IN',
    })
    expect(result.breakdown.silenceCoteNous).toBe(100)
  })

  it('level is warn in intermediate range', () => {
    // event in 30 days → proximite = max(0, 100-60) = 40
    // last IN message 10h ago → silence = min(100, 20) = 20
    // score = round((40*0.5 + 20*0.5) * 1.5) = round(30*1.5) = 45
    const thirtyDaysOut = new Date('2025-07-01T10:00:00Z')
    const tenHoursAgo = new Date('2025-06-01T00:00:00Z')
    const result = calculerUrgenceDemande({
      statut: 'NOUVELLE', dateEvenement: thirtyDaysOut,
      now: NOW, lastMessageAt: tenHoursAgo, lastMessageDirection: 'IN',
    })
    expect(result.score).toBeGreaterThanOrEqual(30)
    expect(result.score).toBeLessThanOrEqual(60)
    expect(result.level).toBe('warn')
  })

  it('ATTENTE_CLIENT applies 0.7 multiplier, yielding lower score than NOUVELLE', () => {
    const tomorrow = new Date('2025-06-02T10:00:00Z')
    const twelveHoursAgo = new Date('2025-05-31T22:00:00Z')
    const resultNOUVELLE = calculerUrgenceDemande({
      statut: 'NOUVELLE', dateEvenement: tomorrow,
      now: NOW, lastMessageAt: twelveHoursAgo, lastMessageDirection: 'IN',
    })
    const resultATTENTE = calculerUrgenceDemande({
      statut: 'ATTENTE_CLIENT', dateEvenement: tomorrow,
      now: NOW, lastMessageAt: twelveHoursAgo, lastMessageDirection: 'IN',
    })
    expect(resultATTENTE.score).toBeLessThan(resultNOUVELLE.score)
  })
})

// ─── PR2 — boost unread / isUnread / delai config ──────────────────────────

describe('isUnread (PR2)', () => {
  const refDate = new Date('2026-04-30T10:00:00Z')

  it('T7 — IN sans lastSeenByAssigneeAt → unread', () => {
    expect(isUnread({
      lastMessageDirection: 'IN',
      lastMessageAt: refDate,
      lastSeenByAssigneeAt: null,
    })).toBe(true)
  })

  it('IN avec lastSeenByAssigneeAt antérieur → unread', () => {
    expect(isUnread({
      lastMessageDirection: 'IN',
      lastMessageAt: refDate,
      lastSeenByAssigneeAt: new Date('2026-04-30T09:00:00Z'),
    })).toBe(true)
  })

  it('T8 — IN avec lastSeenByAssigneeAt postérieur (mark-read appliqué) → read', () => {
    expect(isUnread({
      lastMessageDirection: 'IN',
      lastMessageAt: refDate,
      lastSeenByAssigneeAt: new Date('2026-04-30T11:00:00Z'),
    })).toBe(false)
  })

  it('OUT (réponse envoyée) → jamais unread, indépendamment de lastSeen', () => {
    expect(isUnread({
      lastMessageDirection: 'OUT',
      lastMessageAt: refDate,
      lastSeenByAssigneeAt: null,
    })).toBe(false)
  })

  it('aucun lastMessageAt → pas unread (cas demande sans message)', () => {
    expect(isUnread({
      lastMessageDirection: 'IN',
      lastMessageAt: null,
      lastSeenByAssigneeAt: null,
    })).toBe(false)
  })
})

describe('readDelaiAttenteClientJours (PR2)', () => {
  it('default = 7 si config null/undefined/objet vide', () => {
    expect(readDelaiAttenteClientJours(null)).toBe(DEFAULT_DELAI_ATTENTE_CLIENT_JOURS)
    expect(readDelaiAttenteClientJours(undefined)).toBe(DEFAULT_DELAI_ATTENTE_CLIENT_JOURS)
    expect(readDelaiAttenteClientJours({})).toBe(DEFAULT_DELAI_ATTENTE_CLIENT_JOURS)
  })

  it('T12 — config.delaiAttenteClientJours=14 surcharge le default', () => {
    expect(readDelaiAttenteClientJours({ delaiAttenteClientJours: 14 })).toBe(14)
  })

  it('valeurs invalides → default (string, négatif, NaN, 0)', () => {
    expect(readDelaiAttenteClientJours({ delaiAttenteClientJours: 'foo' })).toBe(7)
    expect(readDelaiAttenteClientJours({ delaiAttenteClientJours: -3 })).toBe(7)
    expect(readDelaiAttenteClientJours({ delaiAttenteClientJours: 0 })).toBe(7)
    expect(readDelaiAttenteClientJours({ delaiAttenteClientJours: NaN })).toBe(7)
  })
})

describe('calculerUrgenceDemande — boost unread (PR2)', () => {
  it('T11 — hasUnread=true sur EN_COURS ajoute UNREAD_BOOST au score, dépasse forcément non-unread', () => {
    const sameInputs = {
      statut: 'EN_COURS' as const,
      dateEvenement: new Date('2030-01-01T00:00:00Z'), // far future, low proximité
      now: NOW,
      lastMessageAt: NOW,
      lastMessageDirection: 'OUT' as const, // pas de silenceCoteNous
    }
    const read = calculerUrgenceDemande({ ...sameInputs, hasUnread: false })
    const unread = calculerUrgenceDemande({ ...sameInputs, hasUnread: true })
    expect(unread.score).toBe(read.score + UNREAD_BOOST)
    expect(unread.breakdown.unreadBoost).toBe(UNREAD_BOOST)
    expect(read.breakdown.unreadBoost).toBe(0)
  })

  it('boost garantit unread > read même contre score saturé', () => {
    // Read avec score saturé (proximité=100, silence=100, mult=1.5) = 150
    // Unread sans signaux = 0 + 10000
    const tomorrow = new Date('2025-06-02T00:00:00Z')
    const longAgo = new Date('2025-01-01T00:00:00Z')
    const readSaturated = calculerUrgenceDemande({
      statut: 'NOUVELLE', dateEvenement: tomorrow,
      now: NOW, lastMessageAt: longAgo, lastMessageDirection: 'IN',
      hasUnread: false,
    })
    const unreadCold = calculerUrgenceDemande({
      statut: 'EN_COURS', dateEvenement: null,
      now: NOW, lastMessageAt: null, lastMessageDirection: null,
      hasUnread: true,
    })
    expect(unreadCold.score).toBeGreaterThan(readSaturated.score)
  })

  it('T10 — ANNULEE/PERDUE/CONFIRMEE : boost ignoré (statut terminal court-circuité)', () => {
    for (const statut of ['ANNULEE', 'PERDUE', 'CONFIRMEE'] as const) {
      const result = calculerUrgenceDemande({
        statut, dateEvenement: null,
        now: NOW, lastMessageAt: null, lastMessageDirection: null,
        hasUnread: true,
      })
      expect(result.score).toBe(0)
      expect(result.breakdown.unreadBoost).toBe(0)
    }
  })

  it('rétrocompat : hasUnread non passé → unreadBoost=0, score normal', () => {
    const sansBoost = calculerUrgenceDemande({
      statut: 'EN_COURS', dateEvenement: null,
      now: NOW, lastMessageAt: NOW, lastMessageDirection: 'IN',
    })
    expect(sansBoost.breakdown.unreadBoost).toBe(0)
    expect(sansBoost.score).toBeLessThan(UNREAD_BOOST)
  })
})
