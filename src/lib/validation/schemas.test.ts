import { describe, it, expect } from 'vitest'
import { PatchDemandeSchema } from './schemas'

// PR6 — Garde-fou : contraintesAlimentaires accepté + autres champs editable
// inline restent acceptés.

describe('PatchDemandeSchema (PR6)', () => {
  it('accepte contraintesAlimentaires comme array de strings', () => {
    const r = PatchDemandeSchema.safeParse({ contraintesAlimentaires: ['vegetarien', 'sans_gluten'] })
    expect(r.success).toBe(true)
  })

  it('accepte contraintesAlimentaires vide', () => {
    const r = PatchDemandeSchema.safeParse({ contraintesAlimentaires: [] })
    expect(r.success).toBe(true)
  })

  it('rejette contraintesAlimentaires non-array', () => {
    const r = PatchDemandeSchema.safeParse({ contraintesAlimentaires: 'vegetarien' })
    expect(r.success).toBe(false)
  })

  it('rejette contraintesAlimentaires > 20 entrées', () => {
    const r = PatchDemandeSchema.safeParse({
      contraintesAlimentaires: Array(21).fill('x'),
    })
    expect(r.success).toBe(false)
  })

  it('accepte typeEvenement nullable', () => {
    expect(PatchDemandeSchema.safeParse({ typeEvenement: 'MARIAGE' }).success).toBe(true)
    expect(PatchDemandeSchema.safeParse({ typeEvenement: null }).success).toBe(true)
  })

  it('accepte dateEvenement format ISO yyyy-mm-dd', () => {
    expect(PatchDemandeSchema.safeParse({ dateEvenement: '2026-12-24' }).success).toBe(true)
    expect(PatchDemandeSchema.safeParse({ dateEvenement: 'pas une date' }).success).toBe(false)
  })

  it('accepte heureDebut format HH:MM', () => {
    expect(PatchDemandeSchema.safeParse({ heureDebut: '19:30' }).success).toBe(true)
    expect(PatchDemandeSchema.safeParse({ heureDebut: '7:30' }).success).toBe(false)
  })

  it('rejette nbInvites hors range', () => {
    expect(PatchDemandeSchema.safeParse({ nbInvites: 0 }).success).toBe(false)
    expect(PatchDemandeSchema.safeParse({ nbInvites: 5001 }).success).toBe(false)
    expect(PatchDemandeSchema.safeParse({ nbInvites: 80 }).success).toBe(true)
  })

  it('rejette champ inconnu (.strict)', () => {
    const r = PatchDemandeSchema.safeParse({ champInconnu: 'x' })
    expect(r.success).toBe(false)
  })
})
