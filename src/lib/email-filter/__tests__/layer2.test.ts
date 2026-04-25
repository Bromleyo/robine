import { describe, it, expect } from 'vitest'
import { checkSpamHeaders } from '../layer2-headers'
import type { NormalizedEmail } from '@/lib/email/types'

function makeEmail(fromAddress: string, headers: Record<string, string> = {}): NormalizedEmail {
  return {
    providerMessageId: 'msg-1',
    internetMessageId: '<msg-1@test>',
    conversationId: 'conv-1',
    subject: 'Test',
    from: { address: fromAddress, name: 'Sender' },
    toRecipients: ['event@le-robin.fr'],
    ccRecipients: [],
    bodyHtml: null,
    bodyText: 'Hello',
    receivedAt: new Date('2026-04-24T10:00:00Z'),
    headers,
    inReplyTo: null,
    references: [],
  }
}

describe('checkSpamHeaders', () => {
  it('accepts a clean legitimate email', () => {
    expect(checkSpamHeaders(makeEmail('client@gmail.com'))).toBeNull()
  })

  it('rejects List-Unsubscribe header', () => {
    const msg = makeEmail('news@brand.com', { 'list-unsubscribe': '<mailto:unsub@brand.com>' })
    expect(checkSpamHeaders(msg)).toMatchObject({ rejectReason: 'spam_headers' })
  })

  it('rejects List-Unsubscribe-Post header', () => {
    const msg = makeEmail('news@brand.com', { 'list-unsubscribe-post': 'List-Unsubscribe=One-Click' })
    expect(checkSpamHeaders(msg)).toMatchObject({ rejectReason: 'spam_headers' })
  })

  it('rejects Auto-Submitted: auto-generated', () => {
    const msg = makeEmail('system@saas.com', { 'auto-submitted': 'auto-generated' })
    expect(checkSpamHeaders(msg)).toMatchObject({ rejectReason: 'spam_headers' })
  })

  it('accepts Auto-Submitted: no', () => {
    const msg = makeEmail('client@gmail.com', { 'auto-submitted': 'no' })
    expect(checkSpamHeaders(msg)).toBeNull()
  })

  it('rejects Precedence: bulk', () => {
    const msg = makeEmail('bulk@newsletter.com', { 'precedence': 'bulk' })
    expect(checkSpamHeaders(msg)).toMatchObject({ rejectReason: 'spam_headers' })
  })

  it('rejects Precedence: list', () => {
    const msg = makeEmail('list@newsletter.com', { 'precedence': 'list' })
    expect(checkSpamHeaders(msg)).toMatchObject({ rejectReason: 'spam_headers' })
  })

  it('rejects X-Mailgun-* header', () => {
    const msg = makeEmail('send@mg.example.com', { 'x-mailgun-tag': 'transactional' })
    expect(checkSpamHeaders(msg)).toMatchObject({ rejectReason: 'spam_headers' })
  })

  it('rejects X-Sendgrid-* header', () => {
    const msg = makeEmail('send@example.com', { 'x-sendgrid-eid': 'abc123' })
    expect(checkSpamHeaders(msg)).toMatchObject({ rejectReason: 'spam_headers' })
  })

  it('rejects noreply@ sender', () => {
    expect(checkSpamHeaders(makeEmail('noreply@saas.com'))).toMatchObject({ action: 'reject', rejectReason: 'noreply_sender' })
  })

  it('rejects no-reply@ sender', () => {
    expect(checkSpamHeaders(makeEmail('no-reply@platform.io'))).toMatchObject({ rejectReason: 'noreply_sender' })
  })

  it('rejects newsletter@ sender', () => {
    expect(checkSpamHeaders(makeEmail('newsletter@brand.fr'))).toMatchObject({ rejectReason: 'noreply_sender' })
  })

  it('rejects marketing@ sender', () => {
    expect(checkSpamHeaders(makeEmail('marketing@agency.com'))).toMatchObject({ rejectReason: 'noreply_sender' })
  })

  it('rejects notifications@ sender', () => {
    expect(checkSpamHeaders(makeEmail('notifications@app.com'))).toMatchObject({ rejectReason: 'noreply_sender' })
  })
})
