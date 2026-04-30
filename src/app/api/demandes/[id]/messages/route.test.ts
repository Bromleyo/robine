import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks ────────────────────────────────────────────────────────────
// Hoistés par vitest. Doivent venir avant l'import du SUT.

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    demande: { findFirst: vi.fn(), update: vi.fn() },
    outlookMailbox: { findFirst: vi.fn() },
    message: { create: vi.fn() },
  },
}))

vi.mock('@/lib/graph/messages', () => ({
  sendGraphReply: vi.fn(),
}))

import { POST } from './route'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { sendGraphReply } from '@/lib/graph/messages'
import { NextRequest } from 'next/server'

const mauth = vi.mocked(auth)
const mp = vi.mocked(prisma)
const msend = vi.mocked(sendGraphReply)

const RESTAURANT_ID = 'rest-1'

function makeRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/demandes/d1/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const params = () => Promise.resolve({ id: 'd1' })

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/demandes/[id]/messages — fix sharedMailboxEmail (Bug 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mauth.mockResolvedValue({ user: { restaurantId: RESTAURANT_ID } } as never)
    mp.demande.findFirst.mockResolvedValue({
      id: 'd1',
      contact: { email: 'client@example.com' },
      threads: [{
        id: 'thread-1',
        messages: [{ microsoftGraphId: 'graph-id-123' }],
      }],
    } as never)
    msend.mockResolvedValue('<internet-id>')
    mp.message.create.mockResolvedValue({} as never)
    mp.demande.update.mockResolvedValue({} as never)
  })

  it('Cas 1 — boîte partagée : sendGraphReply reçoit sharedMailboxEmail comme cible', async () => {
    mp.outlookMailbox.findFirst.mockResolvedValue({
      email: 'info@le-robin.fr',
      sharedMailboxEmail: 'event@le-robin.fr',
    } as never)

    const res = await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    expect(res.status).toBe(200)
    expect(msend).toHaveBeenCalledOnce()
    expect(msend.mock.calls[0]![0]).toBe('event@le-robin.fr')
  })

  it('Cas 2 — boîte perso (sharedMailboxEmail null) : fallback sur email', async () => {
    mp.outlookMailbox.findFirst.mockResolvedValue({
      email: 'lucia@le-robin.com',
      sharedMailboxEmail: null,
    } as never)

    const res = await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    expect(res.status).toBe(200)
    expect(msend).toHaveBeenCalledOnce()
    expect(msend.mock.calls[0]![0]).toBe('lucia@le-robin.com')
  })

  it('Cas 3 — message DB créé avec fromEmail = targetMailbox (boîte partagée)', async () => {
    mp.outlookMailbox.findFirst.mockResolvedValue({
      email: 'info@le-robin.fr',
      sharedMailboxEmail: 'event@le-robin.fr',
    } as never)

    await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    expect(mp.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'OUT',
          fromEmail: 'event@le-robin.fr',
          toEmails: ['client@example.com'],
        }),
      }),
    )
  })
})
