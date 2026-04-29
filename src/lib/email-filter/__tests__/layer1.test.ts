import { describe, it, expect } from 'vitest'
import { checkAddressing, checkBlacklistedSender } from '../layer1-addressing'
import type { NormalizedEmail } from '@/lib/email/types'

function makeEmail(overrides: Partial<NormalizedEmail> = {}): NormalizedEmail {
  return {
    providerMessageId: 'msg-1',
    internetMessageId: '<msg-1@test>',
    conversationId: 'conv-1',
    subject: 'Test',
    from: { address: 'sender@example.com', name: 'Sender' },
    toRecipients: [],
    ccRecipients: [],
    bodyHtml: null,
    bodyText: 'Hello',
    receivedAt: new Date('2026-04-24T10:00:00Z'),
    headers: {},
    inReplyTo: null,
    references: [],
    ...overrides,
  }
}

const MAILBOX = 'event@le-robin.fr'

describe('checkAddressing', () => {
  it('accepts when mailbox is in to', () => {
    const msg = makeEmail({ toRecipients: [MAILBOX] })
    expect(checkAddressing(msg, MAILBOX)).toBeNull()
  })

  it('accepts when mailbox is in cc', () => {
    const msg = makeEmail({ ccRecipients: [MAILBOX] })
    expect(checkAddressing(msg, MAILBOX)).toBeNull()
  })

  it('accepts case-insensitive match', () => {
    const msg = makeEmail({ toRecipients: ['Event@Le-Robin.FR'] })
    expect(checkAddressing(msg, MAILBOX)).toBeNull()
  })

  it('rejects when mailbox only in bcc (not in to/cc)', () => {
    const msg = makeEmail()
    expect(checkAddressing(msg, MAILBOX)).toMatchObject({ action: 'reject', rejectReason: 'not_addressed' })
  })

  it('rejects when mailbox is absent from all recipients', () => {
    const msg = makeEmail({ toRecipients: ['other@restaurant.com'] })
    expect(checkAddressing(msg, MAILBOX)).toMatchObject({ action: 'reject', rejectReason: 'not_addressed' })
  })

  it('accepts when mailbox is among multiple to recipients', () => {
    const msg = makeEmail({ toRecipients: ['boss@restaurant.com', MAILBOX] })
    expect(checkAddressing(msg, MAILBOX)).toBeNull()
  })
})

describe('checkBlacklistedSender', () => {
  it('rejects email from blacklisted sender with reason test_email', () => {
    const msg = makeEmail({ from: { address: 'jimmy.dubreuil@gmail.com', name: 'Jimmy' } })
    expect(checkBlacklistedSender(msg)).toMatchObject({ action: 'reject', rejectReason: 'test_email' })
  })

  it('rejects case-insensitively', () => {
    const msg = makeEmail({ from: { address: 'Jimmy.Dubreuil@Gmail.COM', name: 'Jimmy' } })
    expect(checkBlacklistedSender(msg)).toMatchObject({ action: 'reject', rejectReason: 'test_email' })
  })

  it('passes through email not in blacklist', () => {
    const msg = makeEmail({ from: { address: 'client@example.com', name: 'Client' } })
    expect(checkBlacklistedSender(msg)).toBeNull()
  })
})
