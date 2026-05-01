import { describe, it, expect, vi, beforeEach } from 'vitest'

// Bypass cron auth pour tous les tests.
vi.mock('@/lib/cron-auth', () => ({
  verifyCronRequest: vi.fn(() => null),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    demande: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    regleIA: { findMany: vi.fn() },
  },
}))

import { GET } from './route'
import { prisma } from '@/lib/db/prisma'
import { NextRequest } from 'next/server'

const mp = vi.mocked(prisma)

const NOW = new Date('2026-04-30T12:00:00Z')
const RESTAURANT_A = 'rest-A'
const RESTAURANT_B = 'rest-B'

function makeReq() {
  return new NextRequest('http://localhost/api/cron/urgence')
}

describe('cron/urgence — R2 transitions (PR2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mp.regleIA.findMany.mockResolvedValue([])
    mp.demande.updateMany.mockResolvedValue({ count: 0 } as never)
    mp.demande.update.mockResolvedValue({} as never)
  })

  it('T3 — EN_COURS, OUT 8 jours → bascule ATTENTE_CLIENT', async () => {
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000)
    mp.demande.findMany.mockResolvedValue([
      {
        id: 'd-stale', restaurantId: RESTAURANT_A, statut: 'EN_COURS',
        dateEvenement: null, lastMessageAt: eightDaysAgo,
        lastMessageDirection: 'OUT', lastSeenByAssigneeAt: null,
      },
    ] as never)

    await GET(makeReq())

    expect(mp.demande.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['d-stale'] } },
      data: { statut: 'ATTENTE_CLIENT' },
    })
  })

  it('T4 — EN_COURS, lastMessageDirection=IN → PAS de bascule R2', async () => {
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000)
    mp.demande.findMany.mockResolvedValue([
      {
        id: 'd-in', restaurantId: RESTAURANT_A, statut: 'EN_COURS',
        dateEvenement: null, lastMessageAt: eightDaysAgo,
        lastMessageDirection: 'IN', lastSeenByAssigneeAt: null,
      },
    ] as never)

    await GET(makeReq())
    expect(mp.demande.updateMany).not.toHaveBeenCalled()
  })

  it('idempotent — ATTENTE_CLIENT déjà transitionné n\'est pas re-trigger', async () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000)
    mp.demande.findMany.mockResolvedValue([
      {
        id: 'd-already', restaurantId: RESTAURANT_A, statut: 'ATTENTE_CLIENT',
        dateEvenement: null, lastMessageAt: tenDaysAgo,
        lastMessageDirection: 'OUT', lastSeenByAssigneeAt: null,
      },
    ] as never)

    await GET(makeReq())
    expect(mp.demande.updateMany).not.toHaveBeenCalled()
  })

  it('T12 — restaurant avec delai=14 ne bascule PAS à J+8 mais bascule à J+14', async () => {
    mp.regleIA.findMany.mockResolvedValue([
      { restaurantId: RESTAURANT_B, config: { delaiAttenteClientJours: 14 } },
    ] as never)
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000)
    const fifteenDaysAgo = new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000)
    mp.demande.findMany.mockResolvedValue([
      {
        id: 'd-8j', restaurantId: RESTAURANT_B, statut: 'EN_COURS',
        dateEvenement: null, lastMessageAt: eightDaysAgo,
        lastMessageDirection: 'OUT', lastSeenByAssigneeAt: null,
      },
      {
        id: 'd-15j', restaurantId: RESTAURANT_B, statut: 'EN_COURS',
        dateEvenement: null, lastMessageAt: fifteenDaysAgo,
        lastMessageDirection: 'OUT', lastSeenByAssigneeAt: null,
      },
    ] as never)

    await GET(makeReq())

    expect(mp.demande.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['d-15j'] } },
      data: { statut: 'ATTENTE_CLIENT' },
    })
  })

  it('réponse JSON expose le compte de transitions', async () => {
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000)
    mp.demande.findMany.mockResolvedValue([
      {
        id: 'd1', restaurantId: RESTAURANT_A, statut: 'EN_COURS',
        dateEvenement: null, lastMessageAt: eightDaysAgo,
        lastMessageDirection: 'OUT', lastSeenByAssigneeAt: null,
      },
    ] as never)

    const res = await GET(makeReq())
    const body = await res.json() as { ok: boolean; updated: number; transitions: number }
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(1)
    expect(body.transitions).toBe(1)
  })
})
