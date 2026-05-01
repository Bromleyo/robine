import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processIncomingEmail } from './process-incoming'
import type { NormalizedEmail } from './types'
import type { MailboxRef } from './process-incoming'

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    message: { findFirst: vi.fn(), create: vi.fn() },
    thread:  { findFirst: vi.fn(), create: vi.fn() },
    // PR2 — findUnique requis par R3/R4 pour lire le statut courant avant transition.
    demande: { update: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    contact: { upsert:  vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/lib/email-filter', () => ({
  filterEmail: vi.fn(() => ({
    decision: { action: 'accept_direct', matchedKeywords: [] },
    extractedBasic: null,
  })),
}))

vi.mock('@/lib/business/conflit',  () => ({ detecterConflits:      vi.fn().mockResolvedValue({ hasConflict: false }) }))
vi.mock('@/lib/business/urgence',  () => ({ calculerUrgenceDemande: vi.fn().mockReturnValue({ score: 0, level: 'fresh' }) }))
vi.mock('@/lib/db/demandes',       () => ({ nextReferenceSeq:       vi.fn().mockResolvedValue('DR-TEST') }))
vi.mock('@/lib/db/notifications',  () => ({ notifyRestaurant:       vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/logger',            () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db/prisma'
const mp = vi.mocked(prisma)

function makeEmail(overrides: Partial<NormalizedEmail> = {}): NormalizedEmail {
  return {
    providerMessageId: 'graph-msg-1',
    internetMessageId: '<msg-1@mail.example.com>',
    conversationId:    null,
    subject:           'Test événement',
    from:              { address: 'client@example.com', name: 'Client' },
    toRecipients:      ['event@le-robin.fr'],
    ccRecipients:      [],
    bodyHtml:          null,
    bodyText:          'Bonjour, je souhaite réserver pour un événement',
    receivedAt:        new Date('2026-04-27T10:00:00Z'),
    headers:           {},
    inReplyTo:         null,
    references:        [],
    ...overrides,
  }
}

const MAILBOX: MailboxRef = { id: 'mailbox-1', email: 'event@le-robin.fr', restaurantId: 'restaurant-A' }

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('processIncomingEmail — thread matching fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mp.message.create.mockResolvedValue({} as never)
    mp.demande.update.mockResolvedValue({} as never)
    mp.demande.create.mockResolvedValue({ id: 'new-demande' } as never)
    mp.contact.upsert.mockResolvedValue({ id: 'contact-1' } as never)
    mp.contact.update.mockResolvedValue({} as never)
    mp.thread.create.mockResolvedValue({ id: 'new-thread' } as never)
    // PR2 — default : EN_COURS (pas de transition R3/R4 sauf override par test).
    mp.demande.findUnique.mockResolvedValue({ statut: 'EN_COURS' } as never)
  })

  it('Test A — primary: email avec graphConversationId matchant → rattaché au thread existant', async () => {
    mp.message.findFirst.mockResolvedValueOnce(null) // dedup: pas de doublon
    mp.thread.findFirst.mockResolvedValueOnce({ id: 'thread-A', demandeId: 'demande-A' } as never)

    await processIncomingEmail(makeEmail({ conversationId: 'conv-A' }), MAILBOX)

    expect(mp.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ threadId: 'thread-A' }) })
    )
    expect(mp.demande.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'demande-A' } })
    )
    expect(mp.demande.create).not.toHaveBeenCalled()
  })

  it('Test B — fallback 2: email sans conversationId avec inReplyTo → rattaché via messageIdHeader', async () => {
    mp.message.findFirst
      .mockResolvedValueOnce(null) // dedup
      .mockResolvedValueOnce({ threadId: 'thread-B', thread: { demandeId: 'demande-B' } } as never)

    await processIncomingEmail(
      makeEmail({ conversationId: null, inReplyTo: '<parent@mail.example.com>' }),
      MAILBOX,
    )

    expect(mp.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ threadId: 'thread-B' }) })
    )
    expect(mp.demande.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'demande-B' } })
    )
    // conversationId absent → thread.findFirst jamais appelé
    expect(mp.thread.findFirst).not.toHaveBeenCalled()
    expect(mp.demande.create).not.toHaveBeenCalled()
  })

  it('Test C — fallback 3: references[] match → rattaché via ancestor (inReplyTo inconnu en DB)', async () => {
    mp.message.findFirst
      .mockResolvedValueOnce(null)  // dedup
      .mockResolvedValueOnce(null)  // fallback 2: inReplyTo présent mais introuvable en DB
      .mockResolvedValueOnce({ threadId: 'thread-C', thread: { demandeId: 'demande-C' } } as never)

    await processIncomingEmail(
      makeEmail({
        conversationId: null,
        inReplyTo:      '<ghost@mail.example.com>',
        references:     ['<ancestor@mail.example.com>'],
      }),
      MAILBOX,
    )

    expect(mp.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ threadId: 'thread-C' }) })
    )
    expect(mp.demande.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'demande-C' } })
    )
    expect(mp.demande.create).not.toHaveBeenCalled()
  })

  it('Test D — aucun signal de threading (cas DR-0028) → nouvelle demande créée', async () => {
    mp.message.findFirst.mockResolvedValue(null)
    mp.thread.findFirst.mockResolvedValue(null)

    await processIncomingEmail(
      makeEmail({ conversationId: 'conv-unknown', inReplyTo: null, references: [] }),
      MAILBOX,
    )

    expect(mp.demande.create).toHaveBeenCalled()
    expect(mp.thread.create).toHaveBeenCalled()
    // Pas de mise à jour d'une demande existante
    expect(mp.demande.update).not.toHaveBeenCalled()
  })

  it('Test E — multi-tenant: conversationId d\'un autre restaurant ne matche pas', async () => {
    mp.message.findFirst.mockResolvedValue(null)
    mp.thread.findFirst.mockResolvedValue(null)

    await processIncomingEmail(
      makeEmail({ conversationId: 'conv-restaurant-B' }),
      MAILBOX,
    )

    // WHERE contient restaurantId:'restaurant-A' → sécurité multi-tenant prouvée
    expect(mp.thread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          graphConversationId: 'conv-restaurant-B',
          demande: { restaurantId: 'restaurant-A' },
        }),
      })
    )
    // Thread non trouvé → nouvelle demande pour restaurant-A uniquement
    expect(mp.demande.create).toHaveBeenCalled()
  })
})

// ─── PR2 — R3/R4 transitions auto sur IN reçu ───────────────────────────────

describe('processIncomingEmail — transitions R3/R4 (PR2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mp.message.create.mockResolvedValue({} as never)
    mp.demande.update.mockResolvedValue({} as never)
    mp.message.findFirst.mockResolvedValue(null) // pas dédup
    mp.thread.findFirst.mockResolvedValueOnce({ id: 'thread-X', demandeId: 'demande-X' } as never)
  })

  it('T5 (R3) — ATTENTE_CLIENT → EN_COURS sur IN', async () => {
    mp.demande.findUnique.mockResolvedValueOnce({ statut: 'ATTENTE_CLIENT' } as never)

    await processIncomingEmail(makeEmail({ conversationId: 'conv-X' }), MAILBOX)

    expect(mp.demande.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'demande-X' },
        data: expect.objectContaining({
          statut: 'EN_COURS',
          lastMessageDirection: 'IN',
        }),
      }),
    )
  })

  it('T6 (R4) — CONFIRMEE → EN_COURS sur IN, sans toucher contact stats', async () => {
    mp.demande.findUnique.mockResolvedValueOnce({ statut: 'CONFIRMEE' } as never)

    await processIncomingEmail(makeEmail({ conversationId: 'conv-X' }), MAILBOX)

    expect(mp.demande.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: 'EN_COURS' }),
      }),
    )
    // Important : R4 n'inverse PAS les compteurs contact (preserveContactStats).
    expect(mp.contact.update).not.toHaveBeenCalled()
  })

  it('EN_COURS sur IN → pas de transition (déjà ouvert)', async () => {
    mp.demande.findUnique.mockResolvedValueOnce({ statut: 'EN_COURS' } as never)

    await processIncomingEmail(makeEmail({ conversationId: 'conv-X' }), MAILBOX)

    const call = mp.demande.update.mock.calls[0]![0]! as { data: Record<string, unknown> }
    expect(call.data).not.toHaveProperty('statut')
    expect(call.data.lastMessageDirection).toBe('IN')
  })

  it('T10 — ANNULEE/PERDUE NE sont PAS ré-ouvertes par un IN', async () => {
    for (const statut of ['ANNULEE', 'PERDUE'] as const) {
      vi.clearAllMocks()
      mp.message.create.mockResolvedValue({} as never)
      mp.demande.update.mockResolvedValue({} as never)
      mp.message.findFirst.mockResolvedValue(null)
      mp.thread.findFirst.mockResolvedValueOnce({ id: 'thread-X', demandeId: 'demande-X' } as never)
      mp.demande.findUnique.mockResolvedValueOnce({ statut } as never)

      await processIncomingEmail(makeEmail({ conversationId: 'conv-X' }), MAILBOX)

      const call = mp.demande.update.mock.calls[0]![0]! as { data: Record<string, unknown> }
      expect(call.data).not.toHaveProperty('statut')
    }
  })
})
