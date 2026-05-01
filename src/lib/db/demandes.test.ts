import { describe, it, expect } from 'vitest'
import { sortMessagesChronologically, type SortableMessage } from './demandes'

function msg(overrides: Partial<SortableMessage> & { id: string }): SortableMessage {
  return {
    sentAt: null,
    receivedAt: null,
    createdAt: new Date('2026-04-30T00:00:00Z'),
    ...overrides,
  }
}

describe('sortMessagesChronologically (PR3 — P2)', () => {
  it('Cas 1 — 3 messages IN 12:30, OUT 12:35, IN 12:40 → ordre IN, OUT, IN', () => {
    const m1 = msg({ id: 'm1', receivedAt: new Date('2026-04-30T12:30:00Z') })
    const m2 = msg({ id: 'm2', sentAt: new Date('2026-04-30T12:35:00Z') })
    const m3 = msg({ id: 'm3', receivedAt: new Date('2026-04-30T12:40:00Z') })
    // Volontairement passés dans le désordre.
    const sorted = sortMessagesChronologically([m3, m1, m2])
    expect(sorted.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('Cas 2 — IN avec sentAt=null + receivedAt=12:40 → utilise receivedAt', () => {
    const inMsg = msg({
      id: 'in', sentAt: null, receivedAt: new Date('2026-04-30T12:40:00Z'),
      createdAt: new Date('2026-04-30T08:00:00Z'),
    })
    const outOlder = msg({ id: 'out-old', sentAt: new Date('2026-04-30T11:00:00Z') })
    const sorted = sortMessagesChronologically([inMsg, outOlder])
    // out-old (11:00) doit être avant in (12:40, via receivedAt)
    expect(sorted.map(m => m.id)).toEqual(['out-old', 'in'])
  })

  it('Cas 3 — OUT avec receivedAt=null + sentAt=12:35 → utilise sentAt', () => {
    const outMsg = msg({
      id: 'out', sentAt: new Date('2026-04-30T12:35:00Z'), receivedAt: null,
      createdAt: new Date('2026-04-30T08:00:00Z'),
    })
    const inOlder = msg({ id: 'in-old', receivedAt: new Date('2026-04-30T10:00:00Z') })
    const sorted = sortMessagesChronologically([outMsg, inOlder])
    // in-old (10:00) avant out (12:35 via sentAt)
    expect(sorted.map(m => m.id)).toEqual(['in-old', 'out'])
  })

  it('Cas 4 — sentAt et receivedAt tous deux null → fallback createdAt', () => {
    const ghost = msg({
      id: 'ghost', sentAt: null, receivedAt: null,
      createdAt: new Date('2026-04-30T13:00:00Z'),
    })
    const earlier = msg({ id: 'earlier', sentAt: new Date('2026-04-30T12:00:00Z') })
    const sorted = sortMessagesChronologically([ghost, earlier])
    // earlier (12:00 sentAt) avant ghost (13:00 createdAt fallback)
    expect(sorted.map(m => m.id)).toEqual(['earlier', 'ghost'])
  })

  it('Cas 5 — 2 messages avec effectiveDate identique → tri stable par id (cuid lex)', () => {
    const sameDate = new Date('2026-04-30T12:00:00Z')
    const sameCreated = new Date('2026-04-30T12:00:00Z')
    const a = msg({ id: 'cmola', sentAt: sameDate, createdAt: sameCreated })
    const b = msg({ id: 'cmolb', sentAt: sameDate, createdAt: sameCreated })
    // Indépendant de l'ordre d'entrée.
    expect(sortMessagesChronologically([b, a]).map(m => m.id)).toEqual(['cmola', 'cmolb'])
    expect(sortMessagesChronologically([a, b]).map(m => m.id)).toEqual(['cmola', 'cmolb'])
  })

  it('régression DR-0052 — IN 12:40 + OUT 12:35 → OUT avant IN', () => {
    // Cas réel observé sur le smoke PR2 : avant le fix, IN remontait
    // au-dessus à cause du tri Prisma NULLS LAST.
    const inMsg = msg({ id: 'in', receivedAt: new Date('2026-04-30T12:40:00Z') })
    const outMsg = msg({ id: 'out', sentAt: new Date('2026-04-30T12:35:00Z') })
    const sorted = sortMessagesChronologically([inMsg, outMsg])
    expect(sorted.map(m => m.id)).toEqual(['out', 'in'])
  })

  it('input non muté (sort retourne une nouvelle liste)', () => {
    const input = [
      msg({ id: 'b', sentAt: new Date('2026-04-30T13:00:00Z') }),
      msg({ id: 'a', sentAt: new Date('2026-04-30T12:00:00Z') }),
    ]
    const inputCopy = [...input]
    sortMessagesChronologically(input)
    expect(input.map(m => m.id)).toEqual(inputCopy.map(m => m.id))
  })
})
