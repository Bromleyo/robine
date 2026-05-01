import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => ({ user: { restaurantId: 'rest-1', role: 'RESPONSABLE', id: 'u1' } })),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    regleIA: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { PATCH } from './route'
import { prisma } from '@/lib/db/prisma'

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/settings/delai-attente-client (PR6 T2)', () => {
  it('rejette < 1', async () => {
    const res = await PATCH(makeReq({ delaiJours: 0 }))
    expect(res.status).toBe(400)
  })

  it('rejette > 90', async () => {
    const res = await PATCH(makeReq({ delaiJours: 91 }))
    expect(res.status).toBe(400)
  })

  it('rejette non-entier', async () => {
    const res = await PATCH(makeReq({ delaiJours: 7.5 }))
    expect(res.status).toBe(400)
  })

  it('accepte 1-90 et merge dans config existante', async () => {
    ;(prisma.regleIA.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      config: { menus: [{ nom: 'A' }], delaiAttenteClientJours: 7 },
    })
    ;(prisma.regleIA.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const res = await PATCH(makeReq({ delaiJours: 14 }))
    expect(res.status).toBe(200)
    const body = await res.json() as { delaiJours: number }
    expect(body.delaiJours).toBe(14)

    const upsertCall = (prisma.regleIA.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // Merge : préserve les autres clés de config + override le délai
    expect(upsertCall.update.config.menus).toEqual([{ nom: 'A' }])
    expect(upsertCall.update.config.delaiAttenteClientJours).toBe(14)
  })

  it('crée config si pas de RegleIA existante', async () => {
    ;(prisma.regleIA.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.regleIA.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const res = await PATCH(makeReq({ delaiJours: 30 }))
    expect(res.status).toBe(200)
    const upsertCall = (prisma.regleIA.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(upsertCall.create.config.delaiAttenteClientJours).toBe(30)
  })
})
