import { describe, it, expect } from 'vitest'
import { checkBusinessSignals } from '../layer3-business'
import type { NormalizedEmail } from '@/lib/email/types'

function makeEmail(subject: string, fromAddress = 'client@gmail.com'): NormalizedEmail {
  return {
    providerMessageId: 'msg-1',
    internetMessageId: '<msg-1@test>',
    conversationId: 'conv-1',
    subject,
    from: { address: fromAddress, name: 'Sender' },
    toRecipients: ['event@le-robin.fr'],
    ccRecipients: [],
    bodyHtml: null,
    bodyText: '',
    receivedAt: new Date('2026-04-24T10:00:00Z'),
    headers: {},
    inReplyTo: null,
    references: [],
  }
}

describe('checkBusinessSignals — blacklisted domains', () => {
  it('rejects hubspot.com sender', () => {
    expect(checkBusinessSignals(makeEmail('Hello', 'contact@hubspot.com'), '')).toMatchObject({ action: 'reject', rejectReason: 'blacklisted_domain' })
  })

  it('rejects thefork.com sender', () => {
    expect(checkBusinessSignals(makeEmail('Hello', 'info@thefork.com'), '')).toMatchObject({ action: 'reject', rejectReason: 'blacklisted_domain' })
  })
})

describe('checkBusinessSignals — prospection phrases', () => {
  it('rejects classic cold email', () => {
    const body = 'Je me permets de vous contacter concernant notre offre logicielle.'
    expect(checkBusinessSignals(makeEmail('Notre solution'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('rejects "sauf erreur de ma part" relance', () => {
    const body = "Sauf erreur de ma part, vous n'avez pas répondu à mon dernier message."
    expect(checkBusinessSignals(makeEmail('Relance'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('sends to LLM when prospection phrase + strong event keyword (soft reject)', () => {
    const body = 'Je me permets de vous contacter pour organiser un séminaire privatisé chez vous.'
    expect(checkBusinessSignals(makeEmail('Séminaire'), body)).toMatchObject({ action: 'send_to_llm', softRejectReason: expect.any(String) })
  })
})

describe('checkBusinessSignals — hard positive (accept_direct)', () => {
  it('accepts on strong keyword "mariage" in subject', () => {
    expect(checkBusinessSignals(makeEmail('Organisation de notre mariage'), '')).toMatchObject({ action: 'accept_direct', matchedKeywords: expect.arrayContaining(['mariage']) })
  })

  it('accepts on strong keyword "privatisation"', () => {
    const result = checkBusinessSignals(makeEmail('Privatisation du restaurant'), '')
    expect(result.action).toBe('accept_direct')
  })

  it('accepts on strong keyword "seminaire"', () => {
    const result = checkBusinessSignals(makeEmail('Séminaire équipe'), '')
    expect(result.action).toBe('accept_direct')
  })

  it('accepts on strong keyword "evjf"', () => {
    const body = 'Nous souhaitons organiser un EVJF pour 12 personnes.'
    const result = checkBusinessSignals(makeEmail('EVJF'), body)
    expect(result.action).toBe('accept_direct')
  })

  it('accepts on 2+ medium keywords', () => {
    const body = 'Nous souhaitons organiser un événement anniversaire pour notre groupe.'
    const result = checkBusinessSignals(makeEmail('Événement'), body)
    expect(result.action).toBe('accept_direct')
  })

  it('accepts on 1 medium keyword + guest count >= 10', () => {
    const body = 'Nous voudrions organiser un repas pour 25 personnes le 15 juin.'
    const result = checkBusinessSignals(makeEmail('Réservation'), body)
    expect(result.action).toBe('accept_direct')
  })

  it('accepts on 1 medium keyword + future date', () => {
    const body = 'Nous souhaiterions réserver pour le 20/09/2026.'
    const result = checkBusinessSignals(makeEmail('Réservation'), body)
    expect(result.action).toBe('accept_direct')
  })
})

describe('checkBusinessSignals — ambiguous (send_to_llm)', () => {
  it('sends vague email to LLM', () => {
    const result = checkBusinessSignals(makeEmail('Bonjour'), "Je souhaitais avoir des informations.")
    expect(result.action).toBe('send_to_llm')
  })

  it('sends 1 medium keyword without date or guests to LLM', () => {
    const body = 'Nous voudrions organiser quelque chose de bien.'
    const result = checkBusinessSignals(makeEmail('Question'), body)
    expect(result.action).toBe('send_to_llm')
  })
})
