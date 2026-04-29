import { describe, it, expect, beforeEach } from 'vitest'
import {
  extractEmailDomain,
  findRestaurantForEmail,
  attachUserToMatchingRestaurant,
} from './onboarding'

// ─── Fake in-memory db ───────────────────────────────────────────────────────

type FakeRestaurant = { id: string; nom: string; allowedDomains: string[] }
type FakeMembership = { id: string; userId: string; restaurantId: string; role: string }

function createFakeDb(initialRestaurants: FakeRestaurant[] = []) {
  const restaurants: FakeRestaurant[] = [...initialRestaurants]
  const memberships: FakeMembership[] = []
  let membershipSeq = 0

  return {
    state: { restaurants, memberships },
    restaurant: {
      async findFirst(args: { where?: { allowedDomains?: { has?: string } } } = {}) {
        const needle = args.where?.allowedDomains?.has
        const match = needle
          ? restaurants.find(r => r.allowedDomains.includes(needle))
          : restaurants[0]
        return match ? { id: match.id, nom: match.nom } : null
      },
    },
    membership: {
      async upsert(args: {
        where: { userId_restaurantId: { userId: string; restaurantId: string } }
        create: { userId: string; restaurantId: string; role: string }
      }) {
        const { userId, restaurantId } = args.where.userId_restaurantId
        const existing = memberships.find(m => m.userId === userId && m.restaurantId === restaurantId)
        if (existing) return existing
        const created: FakeMembership = {
          id: `mb-${++membershipSeq}`,
          userId: args.create.userId,
          restaurantId: args.create.restaurantId,
          role: args.create.role,
        }
        memberships.push(created)
        return created
      },
    },
  }
}

// ─── extractEmailDomain ──────────────────────────────────────────────────────

describe('extractEmailDomain', () => {
  it('extrait le domaine en lowercase', () => {
    expect(extractEmailDomain('Info@LE-ROBIN.fr')).toBe('le-robin.fr')
  })

  it('gère les sous-domaines', () => {
    expect(extractEmailDomain('lucia@lerobin78.onmicrosoft.com')).toBe('lerobin78.onmicrosoft.com')
  })

  it('renvoie null pour un email malformé', () => {
    expect(extractEmailDomain('pas-un-email')).toBeNull()
    expect(extractEmailDomain('trailing@')).toBeNull()
    expect(extractEmailDomain('')).toBeNull()
    expect(extractEmailDomain(null)).toBeNull()
    expect(extractEmailDomain(undefined)).toBeNull()
  })
})

// ─── findRestaurantForEmail ──────────────────────────────────────────────────

describe('findRestaurantForEmail', () => {
  it('matche un restaurant via allowedDomains', async () => {
    const db = createFakeDb([
      { id: 'cmoecboxx', nom: 'Le Robin', allowedDomains: ['le-robin.fr', 'lerobin78.onmicrosoft.com'] },
    ])
    const r = await findRestaurantForEmail('info@le-robin.fr', db)
    expect(r).toEqual({ id: 'cmoecboxx', nom: 'Le Robin' })
  })

  it('matche aussi via le domaine onmicrosoft.com', async () => {
    const db = createFakeDb([
      { id: 'cmoecboxx', nom: 'Le Robin', allowedDomains: ['le-robin.fr', 'lerobin78.onmicrosoft.com'] },
    ])
    const r = await findRestaurantForEmail('lucia@lerobin78.onmicrosoft.com', db)
    expect(r).toEqual({ id: 'cmoecboxx', nom: 'Le Robin' })
  })

  it('renvoie null quand aucun restaurant ne matche', async () => {
    const db = createFakeDb([
      { id: 'cmoecboxx', nom: 'Le Robin', allowedDomains: ['le-robin.fr'] },
    ])
    const r = await findRestaurantForEmail('user@autre-domaine.com', db)
    expect(r).toBeNull()
  })
})

// ─── attachUserToMatchingRestaurant — 4 cas du brief ─────────────────────────

describe('attachUserToMatchingRestaurant', () => {
  let db: ReturnType<typeof createFakeDb>

  beforeEach(() => {
    db = createFakeDb([
      { id: 'cmoecboxx', nom: 'Le Robin', allowedDomains: ['le-robin.fr', 'lerobin78.onmicrosoft.com'] },
    ])
  })

  it('cas 1 — User @le-robin.fr → rejoint cmoecboxx en RESPONSABLE', async () => {
    const result = await attachUserToMatchingRestaurant({
      userId: 'user-info',
      email: 'info@le-robin.fr',
      db,
    })

    expect(result).not.toBeNull()
    expect(result!.restaurant.id).toBe('cmoecboxx')
    expect(result!.membership).toMatchObject({
      userId: 'user-info',
      restaurantId: 'cmoecboxx',
      role: 'RESPONSABLE',
    })
    expect(db.state.memberships).toHaveLength(1)
  })

  it('cas 2 — User @lerobin78.onmicrosoft.com → rejoint cmoecboxx en RESPONSABLE', async () => {
    const result = await attachUserToMatchingRestaurant({
      userId: 'user-lucia',
      email: 'lucia@lerobin78.onmicrosoft.com',
      db,
    })

    expect(result).not.toBeNull()
    expect(result!.restaurant.id).toBe('cmoecboxx')
    expect(result!.membership).toMatchObject({
      userId: 'user-lucia',
      restaurantId: 'cmoecboxx',
      role: 'RESPONSABLE',
    })
  })

  it("cas 3 — User @autre-domaine.com → pas de match, l'onboarding standard prend le relais", async () => {
    const result = await attachUserToMatchingRestaurant({
      userId: 'user-extern',
      email: 'someone@autre-domaine.com',
      db,
    })

    expect(result).toBeNull()
    expect(db.state.memberships).toHaveLength(0)
    // Le caller (route /api/onboarding) doit alors créer un nouveau restaurant
    // avec allowedDomains = ['autre-domaine.com']. Voir cas 4 ci-dessous.
  })

  it('cas 4 — Second user du même domaine → rejoint le restaurant créé en RESPONSABLE (idempotent)', async () => {
    // Simulation du résultat du cas 3 : le restaurant a été créé avec
    // allowedDomains = ['autre-domaine.com'] et le créateur est ADMIN.
    db.state.restaurants.push({
      id: 'rest-new',
      nom: 'Autre Restaurant',
      allowedDomains: ['autre-domaine.com'],
    })
    db.state.memberships.push({
      id: 'mb-creator',
      userId: 'user-creator',
      restaurantId: 'rest-new',
      role: 'ADMIN',
    })

    // Un deuxième user du même domaine se connecte
    const result = await attachUserToMatchingRestaurant({
      userId: 'user-collegue',
      email: 'collegue@autre-domaine.com',
      db,
    })

    expect(result).not.toBeNull()
    expect(result!.restaurant.id).toBe('rest-new')
    expect(result!.membership).toMatchObject({
      userId: 'user-collegue',
      restaurantId: 'rest-new',
      role: 'RESPONSABLE',
    })
    // L'admin d'origine n'est pas modifié
    const creator = db.state.memberships.find(m => m.userId === 'user-creator')
    expect(creator?.role).toBe('ADMIN')
  })

  it('idempotence — un même user qui se reconnecte ne crée pas de doublon', async () => {
    await attachUserToMatchingRestaurant({
      userId: 'user-info',
      email: 'info@le-robin.fr',
      db,
    })
    await attachUserToMatchingRestaurant({
      userId: 'user-info',
      email: 'info@le-robin.fr',
      db,
    })

    const mine = db.state.memberships.filter(m => m.userId === 'user-info')
    expect(mine).toHaveLength(1)
  })
})
