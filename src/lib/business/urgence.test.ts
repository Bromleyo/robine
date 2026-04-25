import { describe, it, expect } from 'vitest'
import { calculerUrgenceDemande } from './urgence'

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
