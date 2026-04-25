import { describe, it, expect } from 'vitest'
import { renderTemplate } from './render'

describe('renderTemplate', () => {
  it('substitutes a single variable', () => {
    expect(renderTemplate('Bonjour {{contact.nom}}', { 'contact.nom': 'Alice' }))
      .toBe('Bonjour Alice')
  })

  it('substitutes multiple variables', () => {
    const result = renderTemplate(
      'Bonjour {{contact.nom}}, votre événement {{demande.typeEvenement}} est prévu le {{demande.dateEvenement}}.',
      { 'contact.nom': 'Alice', 'demande.typeEvenement': 'Mariage', 'demande.dateEvenement': '14 juin 2025' },
    )
    expect(result).toBe('Bonjour Alice, votre événement Mariage est prévu le 14 juin 2025.')
  })

  it('leaves unknown variables as-is', () => {
    expect(renderTemplate('Ref: {{demande.reference}}', {}))
      .toBe('Ref: {{demande.reference}}')
  })

  it('substitutes the same variable twice', () => {
    expect(renderTemplate('{{contact.nom}} ({{contact.nom}})', { 'contact.nom': 'Bob' }))
      .toBe('Bob (Bob)')
  })

  it('handles empty template', () => {
    expect(renderTemplate('', { 'contact.nom': 'Alice' })).toBe('')
  })

  it('handles template with no variables', () => {
    expect(renderTemplate('Bonjour !', {})).toBe('Bonjour !')
  })

  it('handles empty string value for a variable', () => {
    expect(renderTemplate('Société: {{contact.societe}}', { 'contact.societe': '' }))
      .toBe('Société: ')
  })
})
