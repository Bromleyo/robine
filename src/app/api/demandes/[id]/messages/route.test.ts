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
    // PR2 — handler utilise $transaction([create, update]) pour la transition
    // R1 atomique. Le mock exécute juste les promesses passées.
    $transaction: vi.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(undefined),
    ),
  },
}))

vi.mock('@/lib/graph/messages', () => ({
  sendGraphReply: vi.fn(),
}))

import { POST } from './route'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { sendGraphReply } from '@/lib/graph/messages'
import { GraphRequestError } from '@/lib/graph/errors'
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
      statut: 'NOUVELLE',
      contact: { email: 'client@example.com' },
      threads: [{
        id: 'thread-1',
        messages: [{ microsoftGraphId: 'graph-id-123' }],
        _count: { messages: 0 },
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

// ─── Logging Graph (Bug 1 follow-up) ─────────────────────────────────────────

describe('POST /api/demandes/[id]/messages — error handling Graph (logging)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mauth.mockResolvedValue({ user: { restaurantId: RESTAURANT_ID } } as never)
    mp.demande.findFirst.mockResolvedValue({
      id: 'd1',
      statut: 'NOUVELLE',
      contact: { email: 'client@example.com' },
      threads: [{
        id: 'thread-1',
        messages: [{ microsoftGraphId: 'graph-id-123' }],
        _count: { messages: 0 },
      }],
    } as never)
    mp.outlookMailbox.findFirst.mockResolvedValue({
      email: 'info@le-robin.fr',
      sharedMailboxEmail: 'event@le-robin.fr',
    } as never)
    mp.message.create.mockResolvedValue({} as never)
    mp.demande.update.mockResolvedValue({} as never)
  })

  it('Graph 403 ErrorAccessDenied → 502 + payload graph_permission_missing', async () => {
    msend.mockRejectedValue(
      new GraphRequestError({
        status: 403,
        graphCode: 'ErrorAccessDenied',
        graphMessage: 'Access is denied. Check credentials and try again.',
        mailboxEmail: 'event@le-robin.fr',
        graphMessageId: 'graph-id-123',
        operation: 'createReply',
      }),
    )

    const res = await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    expect(res.status).toBe(502)
    const body = await res.json() as { error: string; status: number; hint: string }
    expect(body.error).toBe('graph_permission_missing')
    expect(body.status).toBe(403)
    expect(body.hint).toMatch(/Azure AD/i)
    expect(mp.message.create).not.toHaveBeenCalled()
    expect(mp.demande.update).not.toHaveBeenCalled()
  })

  it('Graph 404 ErrorItemNotFound → 502 + payload graph_message_not_found', async () => {
    msend.mockRejectedValue(
      new GraphRequestError({
        status: 404,
        graphCode: 'ErrorItemNotFound',
        graphMessage: 'The specified object was not found in the store.',
        mailboxEmail: 'event@le-robin.fr',
        graphMessageId: 'graph-id-123',
        operation: 'createReply',
      }),
    )

    const res = await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    expect(res.status).toBe(502)
    const body = await res.json() as { error: string; status: number }
    expect(body.error).toBe('graph_message_not_found')
    expect(body.status).toBe(404)
  })

  // PR2 — R1 transitions
  it('T1 (R1) — NOUVELLE + premier OUT → bascule EN_COURS + lastSeenByAssigneeAt set', async () => {
    mp.demande.findFirst.mockResolvedValue({
      id: 'd1',
      statut: 'NOUVELLE',
      contact: { email: 'client@example.com' },
      threads: [{
        id: 'thread-1',
        messages: [{ microsoftGraphId: 'graph-id-123' }],
        _count: { messages: 0 }, // 0 OUT existants → premier OUT
      }],
    } as never)
    msend.mockResolvedValue('<msg-id>')

    await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    expect(mp.demande.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'd1' },
        data: expect.objectContaining({
          statut: 'EN_COURS',
          lastSeenByAssigneeAt: expect.any(Date),
          lastMessageAt: expect.any(Date),
          lastMessageDirection: 'OUT',
        }),
      }),
    )
  })

  it('T2 (R1) — NOUVELLE + 2e OUT (1er manqué) : pas de re-trigger statut, lastSeen quand même mis à jour', async () => {
    mp.demande.findFirst.mockResolvedValue({
      id: 'd1',
      statut: 'NOUVELLE',
      contact: { email: 'client@example.com' },
      threads: [{
        id: 'thread-1',
        messages: [{ microsoftGraphId: 'graph-id-123' }],
        _count: { messages: 1 }, // déjà 1 OUT existant
      }],
    } as never)
    msend.mockResolvedValue('<msg-id>')

    await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    const call = mp.demande.update.mock.calls[0]![0]! as { data: Record<string, unknown> }
    expect(call.data).not.toHaveProperty('statut')
    expect(call.data).toHaveProperty('lastSeenByAssigneeAt')
  })

  it('R1 inactif sur EN_COURS (déjà transitionné) — pas de retour à EN_COURS forcé', async () => {
    mp.demande.findFirst.mockResolvedValue({
      id: 'd1',
      statut: 'EN_COURS',
      contact: { email: 'client@example.com' },
      threads: [{
        id: 'thread-1',
        messages: [{ microsoftGraphId: 'graph-id-123' }],
        _count: { messages: 0 },
      }],
    } as never)
    msend.mockResolvedValue('<msg-id>')

    await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    const call = mp.demande.update.mock.calls[0]![0]! as { data: Record<string, unknown> }
    expect(call.data).not.toHaveProperty('statut')
  })

  it('Graph autre erreur (500) → 502 + payload graph_error', async () => {
    msend.mockRejectedValue(
      new GraphRequestError({
        status: 500,
        graphCode: 'InternalServerError',
        graphMessage: 'Mailbox database is offline.',
        mailboxEmail: 'event@le-robin.fr',
        graphMessageId: 'graph-id-123',
        operation: 'sendDraft',
      }),
    )

    const res = await POST(makeRequest({ body: 'Bonjour' }), { params: params() })

    expect(res.status).toBe(502)
    const body = await res.json() as { error: string; status: number }
    expect(body.error).toBe('graph_error')
    expect(body.status).toBe(500)
  })

  it('Erreur non-Graph re-thrown (pas catché par le handler)', async () => {
    msend.mockRejectedValue(new Error('Unexpected DB failure'))

    await expect(
      POST(makeRequest({ body: 'Bonjour' }), { params: params() }),
    ).rejects.toThrow(/Unexpected DB failure/)
  })
})
