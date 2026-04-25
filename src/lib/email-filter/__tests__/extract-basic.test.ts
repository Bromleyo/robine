import { describe, it, expect } from 'vitest'
import { extractBasicFields } from '../extract-basic'

describe('extractBasicFields — date', () => {
  it('parses dd/mm/yyyy format', () => {
    const { dateEvenement } = extractBasicFields('Mariage', 'Notre mariage le 15/06/2027.')
    expect(dateEvenement).not.toBeNull()
    expect(dateEvenement?.getDate()).toBe(15)
    expect(dateEvenement?.getMonth()).toBe(5)
    expect(dateEvenement?.getFullYear()).toBe(2027)
  })

  it('parses dd-mm-yyyy format', () => {
    const { dateEvenement } = extractBasicFields('', 'Pour le 20-09-2026.')
    expect(dateEvenement).not.toBeNull()
    expect(dateEvenement?.getDate()).toBe(20)
  })

  it('parses "15 juin 2026" French format', () => {
    const { dateEvenement } = extractBasicFields('', 'Notre événement le 15 juin 2026.')
    expect(dateEvenement).not.toBeNull()
    expect(dateEvenement?.getMonth()).toBe(5)
  })

  it('parses "15 juin" without year (infers future)', () => {
    const { dateEvenement } = extractBasicFields('', 'Disponible le 15 juin ?')
    expect(dateEvenement).not.toBeNull()
  })

  it('ignores past dates', () => {
    const { dateEvenement } = extractBasicFields('', 'Événement le 01/01/2020.')
    expect(dateEvenement).toBeNull()
  })

  it('ignores dates more than 2 years in the future', () => {
    const { dateEvenement } = extractBasicFields('', 'Événement le 01/01/2030.')
    expect(dateEvenement).toBeNull()
  })

  it('returns null when no date found', () => {
    const { dateEvenement } = extractBasicFields('Bonjour', 'Je voudrais avoir des informations.')
    expect(dateEvenement).toBeNull()
  })
})

describe('extractBasicFields — nbInvites', () => {
  it('parses "25 personnes"', () => {
    expect(extractBasicFields('', 'Nous serons 25 personnes.').nbInvites).toBe(25)
  })

  it('parses "pour 40"', () => {
    expect(extractBasicFields('', 'Un repas pour 40.').nbInvites).toBe(40)
  })

  it('parses "groupe de 60"', () => {
    expect(extractBasicFields('', 'Un groupe de 60 convives.').nbInvites).toBe(60)
  })

  it('parses "100 invités"', () => {
    expect(extractBasicFields('', '100 invités pour notre mariage.').nbInvites).toBe(100)
  })

  it('ignores count below 2', () => {
    expect(extractBasicFields('', 'Nous serons 1 personne.').nbInvites).toBeNull()
  })

  it('ignores count above 500', () => {
    expect(extractBasicFields('', 'Nous serons 600 personnes.').nbInvites).toBeNull()
  })

  it('returns null when no count found', () => {
    expect(extractBasicFields('Bonjour', 'Je voulais me renseigner.').nbInvites).toBeNull()
  })
})

describe('extractBasicFields — typeEvenement', () => {
  it('detects MARIAGE', () => {
    expect(extractBasicFields('Notre mariage', '').typeEvenement).toBe('MARIAGE')
  })

  it('detects ANNIVERSAIRE', () => {
    expect(extractBasicFields('', 'Pour mon anniversaire.').typeEvenement).toBe('ANNIVERSAIRE')
  })

  it('detects SEMINAIRE from "séminaire"', () => {
    expect(extractBasicFields('Séminaire entreprise', '').typeEvenement).toBe('SEMINAIRE')
  })

  it('detects SEMINAIRE from "team building"', () => {
    expect(extractBasicFields('', 'Nous organisons un team building.').typeEvenement).toBe('SEMINAIRE')
  })

  it('detects COCKTAIL', () => {
    expect(extractBasicFields('Cocktail de fin année', '').typeEvenement).toBe('COCKTAIL')
  })

  it('detects PRIVATISATION', () => {
    expect(extractBasicFields('', 'Nous souhaitons privatiser le restaurant.').typeEvenement).toBe('PRIVATISATION')
  })

  it('detects BAPTEME', () => {
    expect(extractBasicFields('Baptême de Louis', '').typeEvenement).toBe('BAPTEME')
  })

  it('returns null when type is unclear', () => {
    expect(extractBasicFields('Bonjour', 'Renseignements tarifs.').typeEvenement).toBeNull()
  })
})
