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

  it('rejects acms.asso.fr sender (règle 1 — médecine du travail)', () => {
    expect(checkBusinessSignals(makeEmail('Rappel ACMS', 'acms-versailles@acms.asso.fr'), '')).toMatchObject({ action: 'reject', rejectReason: 'blacklisted_domain' })
  })

  it('rejects paypal.fr sender (règle 1 — transaction financière)', () => {
    expect(checkBusinessSignals(makeEmail('Reçu de paiement', 'service@paypal.fr'), '')).toMatchObject({ action: 'reject', rejectReason: 'blacklisted_domain' })
  })

  it('rejects paypal.com sender', () => {
    expect(checkBusinessSignals(makeEmail('Payment receipt', 'service@paypal.com'), '')).toMatchObject({ action: 'reject', rejectReason: 'blacklisted_domain' })
  })
})

describe('checkBusinessSignals — prospection phrases', () => {
  it('rejects STRONG prospection phrase alone (cold sales pitch)', () => {
    // Remplace l'ancien test "cold email" qui utilisait une WEAK seule.
    // Garde la couverture du chemin REJECT 'prospection' via une STRONG.
    const body = "Notre solution permet d'augmenter votre chiffre d'affaires de 30%."
    expect(checkBusinessSignals(makeEmail('Proposition'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('sends to LLM when STRONG prospection phrase + strong event keyword (soft reject)', () => {
    // STRONG + event → LLM (le commercial peut camoufler son pitch derrière "séminaire")
    const body = "Notre solution permet d'organiser des séminaires sur mesure pour votre équipe."
    expect(checkBusinessSignals(makeEmail('Séminaire'), body)).toMatchObject({ action: 'send_to_llm', softRejectReason: expect.any(String) })
  })

  it('rejects "à l\'attention du responsable commercial" (règle 4 — démarchage)', () => {
    const body = "À l'attention du Responsable Commercial. Je vous propose notre solution de visite 360°."
    expect(checkBusinessSignals(makeEmail('Visite 360°'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('rejects "valoriser vos espaces" (règle 4 — démarchage)', () => {
    const body = 'De par votre activité vous cherchez à valoriser vos espaces et rendre votre offre plus attractive.'
    expect(checkBusinessSignals(makeEmail('Proposition commerciale'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('rejects "job dating" in subject (règle 5 — invitation B2B)', () => {
    const body = 'Comme chaque année, nous vous invitons à notre job dating mercredi prochain.'
    expect(checkBusinessSignals(makeEmail('Job Dating CFA Trajectoire'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('rejects "vous êtes invité à participer" (règle 5 — invitation B2B)', () => {
    const body = 'Vous êtes invité à participer à la matinale des professionnels Costco le 21 avril.'
    expect(checkBusinessSignals(makeEmail('Invitation matinale pro'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
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

// ─── Refactor STRONG/WEAK — cas A à I ───────────────────────────────────────

describe('checkBusinessSignals — refactor STRONG/WEAK (cas A à I)', () => {
  it('A — Andréa Barza : 1 WEAK + medium event + future date → ACCEPT', () => {
    // Vrai client, formule polie + signal métier explicite. Régression interdite.
    const body = "Bonjour, je me permets de vous contacter pour organiser l'anniversaire de mes 30 ans avec 25 personnes le 15 juin 2026."
    const result = checkBusinessSignals(makeEmail('Anniversaire'), body)
    expect(result.action).toBe('accept_direct')
  })

  it('B — DR-0052 mariage privatisation → ACCEPT (régression interdite)', () => {
    // Strong event keywords purs, aucune phrase prospection.
    const result = checkBusinessSignals(makeEmail('Demande de privatisation pour mariage'), '')
    expect(result.action).toBe('accept_direct')
  })

  it('C — DR-0051 anniversaire 50 personnes → ACCEPT (régression interdite)', () => {
    // 1 medium event ("anniversaire") + guest count ≥ 10.
    const body = 'Nous souhaitons organiser un anniversaire pour 50 personnes.'
    const result = checkBusinessSignals(makeEmail('Anniversaire'), body)
    expect(result.action).toBe('accept_direct')
  })

  it('D — Marketing pur 2 STRONG sans event → REJECT prospection', () => {
    const body = "Notre solution permet de booster vos ventes et d'optimiser votre gestion."
    expect(checkBusinessSignals(makeEmail('Proposition'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('E — 2 WEAK sans event → LLM softReject "multiple weak prospection phrases"', () => {
    const body = "Je me permets de vous contacter. Je reviens vers vous suite à mon précédent message."
    const result = checkBusinessSignals(makeEmail('Suivi'), body)
    expect(result).toMatchObject({ action: 'send_to_llm', softRejectReason: expect.stringContaining('weak prospection') })
  })

  it('F — WEAK + STRONG → REJECT (STRONG gagne)', () => {
    const body = "Je me permets de vous contacter. Notre solution permet d'optimiser votre gestion."
    expect(checkBusinessSignals(makeEmail('Proposition'), body)).toMatchObject({ action: 'reject', rejectReason: 'prospection' })
  })

  it('G — 1 WEAK seul sans event keyword → send_to_llm (LLM tranche)', () => {
    // Validé Point 1 : pas de REJECT par défaut, on délègue au LLM.
    const body = 'Bonjour, je me permets de vous contacter au sujet de votre établissement.'
    const result = checkBusinessSignals(makeEmail('Question'), body)
    expect(result.action).toBe('send_to_llm')
    // Pas de softReject — c'est juste le fallback "no strong signal"
    if (result.action === 'send_to_llm') {
      expect(result.softRejectReason).toBeUndefined()
    }
  })

  it('H — "rendez-vous téléphonique" (WEAK) + "mariage" (strong event) → ACCEPT', () => {
    // Event keyword winner — le client peut demander un appel pour son mariage.
    const body = "J'aimerais avoir un rendez-vous téléphonique pour discuter de notre mariage en juillet."
    const result = checkBusinessSignals(makeEmail('Mariage'), body)
    expect(result.action).toBe('accept_direct')
  })

  it('I — "sauf erreur de ma part" supprimée + anniversaire 30 personnes → ACCEPT', () => {
    // La phrase #20 supprimée n'interfère plus — le scoring event prime.
    const body = "Sauf erreur de ma part, vous proposez la privatisation pour 30 personnes le 12 mai 2026 ?"
    const result = checkBusinessSignals(makeEmail('Anniversaire'), body)
    expect(result.action).toBe('accept_direct')
  })
})
