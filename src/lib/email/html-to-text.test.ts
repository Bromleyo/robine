import { describe, it, expect } from 'vitest'
import { htmlToText, stripQuotedReply } from './html-to-text'

// ─── htmlToText (régression de base) ─────────────────────────────────────────

describe('htmlToText', () => {
  it('strips simple tags and decodes entities', () => {
    const html = '<p>Bonjour&nbsp;<b>Marie</b></p><p>Salut</p>'
    const text = htmlToText(html)
    expect(text).toContain('Bonjour Marie')
    expect(text).not.toContain('<')
    expect(text).not.toContain('&nbsp;')
  })

  it('decodes &amp; / &lt; / &gt;', () => {
    expect(htmlToText('A &amp; B &lt; C &gt; D')).toBe('A & B < C > D')
  })

  it('preserves line breaks via <br> and </p>', () => {
    const text = htmlToText('Ligne 1<br/>Ligne 2<br/>Ligne 3')
    expect(text.split('\n')).toEqual(['Ligne 1', 'Ligne 2', 'Ligne 3'])
  })

  it('collapses repeated whitespace', () => {
    expect(htmlToText('A     B')).toBe('A B')
  })
})

// ─── stripQuotedReply — patterns existants (régression) ──────────────────────

describe('stripQuotedReply — patterns existants', () => {
  it('cuts at separator line ----- (>= 5 dashes)', () => {
    const text = "Bonjour\n\nMerci d'avance\n\n-----\nFrom: client@x.com"
    expect(stripQuotedReply(text)).toBe("Bonjour\n\nMerci d'avance")
  })

  it('cuts at first line starting with > (quote)', () => {
    const text = 'Bonjour\n\nMerci\n\n> Mail original\n> contenu cité'
    expect(stripQuotedReply(text)).toBe('Bonjour\n\nMerci')
  })

  it('cuts at "De :" header preceded by empty line', () => {
    const text = 'Bonjour Marie\n\nCordialement\nJimmy\n\nDe : marie@x.fr\nEnvoyé : lundi\n…'
    expect(stripQuotedReply(text)).toBe('Bonjour Marie\n\nCordialement\nJimmy')
  })

  it('cuts at "From:" header preceded by empty line', () => {
    const text = 'Hi\n\nThanks\nJimmy\n\nFrom: alice@x.com\nSent: …'
    expect(stripQuotedReply(text)).toBe('Hi\n\nThanks\nJimmy')
  })

  it('does not cut when From: appears mid-paragraph (no empty line before)', () => {
    const text = "Bonjour\nNous parlons d'un email From: bot@x.fr reçu hier.\nMerci"
    expect(stripQuotedReply(text)).toBe(text)
  })
})

// ─── stripQuotedReply — nouveaux patterns Gmail/Outlook FR ───────────────────

describe('stripQuotedReply — pattern FR "Le … a écrit :" (Gmail/Outlook)', () => {
  it('Gmail FR — "Le 23 avr. 2026 à 15:15, John <john@x.com> a écrit :"', () => {
    const text = `Bonjour Marie,

Avec plaisir, je confirme la réservation pour 12 personnes le 5 mai.

Cordialement,
Jimmy

Le 23 avr. 2026 à 15:15, John Doe <john@example.com> a écrit :
Bonjour, est-ce que vous pouvez prendre 12 personnes le 5 mai ?
…le reste du fil cité…`

    const out = stripQuotedReply(text)
    expect(out).toBe(`Bonjour Marie,

Avec plaisir, je confirme la réservation pour 12 personnes le 5 mai.

Cordialement,
Jimmy`)
    expect(out).not.toContain('a écrit')
  })

  it('Outlook FR — variante avec angle brackets et virgule', () => {
    const text = `Merci pour votre retour.

Le 17 févr. 2026 à 15:15 +0100, delmon giulia <giulia@x.fr>, a écrit :
Bonjour …`

    const out = stripQuotedReply(text)
    expect(out).toBe('Merci pour votre retour.')
  })

  it('FR sans accent : "a ecrit :" toléré', () => {
    const text = 'Réponse rapide.\n\nLe 10 mai 2026 à 09:00, anonyme a ecrit :\nMail cité\n'
    expect(stripQuotedReply(text)).toBe('Réponse rapide.')
  })

  it('FR — variante "Le mardi 23 avril ..."', () => {
    const text = 'OK pour vous ?\n\nLe mardi 23 avril 2026, Marie Curie a écrit :\nQuestion initiale\n'
    expect(stripQuotedReply(text)).toBe('OK pour vous ?')
  })

  it("FR — pas d'empty line avant le \"Le …\" → cut AT la ligne", () => {
    const text = 'Réponse courte\nLe 23 avr. 2026, Marie a écrit :\nMail cité'
    expect(stripQuotedReply(text)).toBe('Réponse courte')
  })

  it('FR — ne match PAS si "a écrit" absent', () => {
    const text = 'Bonjour\n\nLe 23 avril était mon anniversaire, super journée.\n\nMerci'
    expect(stripQuotedReply(text)).toBe(text.trim())
  })

  it("FR — ne match PAS un message où \"Le\" n'est pas en début de ligne", () => {
    const text = "Bonjour, je voulais savoir : Le client a écrit qu'il veut annuler ?\nQu'en penses-tu ?"
    expect(stripQuotedReply(text)).toBe(text)
  })
})

// ─── stripQuotedReply — nouveau pattern EN Gmail ─────────────────────────────

describe('stripQuotedReply — pattern EN "On … wrote:" (Gmail)', () => {
  it('Gmail EN — "On Mon, Apr 23, 2026 at 3:15 PM, John <john@x.com> wrote:"', () => {
    const text = `Hi Marie,

Confirmed for 12 people on May 5.

Best,
Jimmy

On Mon, Apr 23, 2026 at 3:15 PM, John Doe <john@example.com> wrote:
Can you take 12 people on May 5?
…quoted thread…`

    const out = stripQuotedReply(text)
    expect(out).toBe(`Hi Marie,

Confirmed for 12 people on May 5.

Best,
Jimmy`)
    expect(out).not.toContain('wrote')
  })

  it('EN — "On April 23, 2026, Alice wrote:" plus court', () => {
    const text = 'Sounds good.\n\nOn April 23, 2026, Alice wrote:\nQuoted content'
    expect(stripQuotedReply(text)).toBe('Sounds good.')
  })

  it("EN — pas d'empty line avant → cut AT la ligne", () => {
    const text = 'OK\nOn Apr 23, Alice wrote:\nQuoted'
    expect(stripQuotedReply(text)).toBe('OK')
  })

  it('EN — ne match PAS sans "wrote"', () => {
    const text = 'Hi\n\nOn April 23 we had a great event\n'
    expect(stripQuotedReply(text)).toBe(text.trim())
  })

  it('EN — ne match PAS "wrote" en milieu de ligne', () => {
    const text = 'I think the client wrote that he wants to cancel.\nWhat do you say?'
    expect(stripQuotedReply(text)).toBe(text)
  })
})

// ─── stripQuotedReply — robustesse ──────────────────────────────────────────

describe('stripQuotedReply — robustesse', () => {
  it('returns text unchanged when no quote markers found', () => {
    const text = 'Bonjour Marie,\n\nMerci pour votre message.\n\nCordialement.'
    expect(stripQuotedReply(text)).toBe(text)
  })

  it('handles empty string', () => {
    expect(stripQuotedReply('')).toBe('')
  })

  it('strips trailing whitespace from result', () => {
    const text = 'Hello\n\n\n\nLe 1 jan 2026, X a écrit :\nQuoted'
    const out = stripQuotedReply(text)
    expect(out).toBe('Hello')
    expect(out.endsWith(' ')).toBe(false)
    expect(out.endsWith('\n')).toBe(false)
  })

  it('uses the FIRST cut marker found (Gmail FR before older > marker)', () => {
    const text = 'A\n\nLe 1 jan 2026, X a écrit :\n> reply line\n> reply line 2'
    expect(stripQuotedReply(text)).toBe('A')
  })
})
