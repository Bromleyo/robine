import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { demande: { updateMany: vi.fn() } },
}))

import { POST } from './route'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { NextRequest } from 'next/server'

const mauth = vi.mocked(auth)
const mp = vi.mocked(prisma)

const RESTAURANT_ID = 'rest-1'
const params = () => Promise.resolve({ id: 'd1' })
const req = () => new NextRequest('http://localhost/api/demandes/d1/mark-read', { method: 'POST' })

describe('POST /api/demandes/[id]/mark-read (PR2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mauth.mockResolvedValue({ user: { restaurantId: RESTAURANT_ID } } as never)
  })

  it('T9 — met à jour lastSeenByAssigneeAt sans toucher au statut', async () => {
    mp.demande.updateMany.mockResolvedValue({ count: 1 } as never)

    const res = await POST(req(), { params: params() })

    expect(res.status).toBe(200)
    expect(mp.demande.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', restaurantId: RESTAURANT_ID },
      data: { lastSeenByAssigneeAt: expect.any(Date) },
    })
    // Ne touche aucun autre champ.
    const call = mp.demande.updateMany.mock.calls[0]![0]! as { data: Record<string, unknown> }
    expect(Object.keys(call.data)).toEqual(['lastSeenByAssigneeAt'])
  })

  it('multi-tenant — 404 si la demande n\'appartient pas au restaurant courant', async () => {
    mp.demande.updateMany.mockResolvedValue({ count: 0 } as never)
    const res = await POST(req(), { params: params() })
    expect(res.status).toBe(404)
  })

  it('401 si pas de session', async () => {
    mauth.mockResolvedValue(null as never)
    const res = await POST(req(), { params: params() })
    expect(res.status).toBe(401)
    expect(mp.demande.updateMany).not.toHaveBeenCalled()
  })
})
