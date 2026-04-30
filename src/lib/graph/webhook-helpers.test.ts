import { describe, it, expect } from 'vitest'
import {
  isLifecycleNotification,
  resolveTargetMailbox,
  type GraphLifecycleNotification,
  type GraphRegularNotification,
} from './webhook-helpers'

// ─── resolveTargetMailbox — Fix #1 ──────────────────────────────────────────

describe('resolveTargetMailbox (Fix #1 — sharedMailboxEmail vs email)', () => {
  it('returns sharedMailboxEmail si présent', () => {
    const out = resolveTargetMailbox({ email: 'info@le-robin.fr', sharedMailboxEmail: 'event@le-robin.fr' })
    expect(out).toBe('event@le-robin.fr')
  })

  it('falls back to email si sharedMailboxEmail est null', () => {
    const out = resolveTargetMailbox({ email: 'info@le-robin.fr', sharedMailboxEmail: null })
    expect(out).toBe('info@le-robin.fr')
  })

  it('falls back to email si sharedMailboxEmail est undefined', () => {
    const out = resolveTargetMailbox({ email: 'info@le-robin.fr' })
    expect(out).toBe('info@le-robin.fr')
  })

  it('utilise sharedMailboxEmail même si vide-string (?? ne tombe pas pour empty string)', () => {
    const out = resolveTargetMailbox({ email: 'info@le-robin.fr', sharedMailboxEmail: '' })
    expect(out).toBe('')
  })
})

// ─── isLifecycleNotification — Fix #3 ───────────────────────────────────────

describe('isLifecycleNotification (Fix #3 — discriminator)', () => {
  it('reconnaît une notification lifecycle "missed"', () => {
    const lifecycle: GraphLifecycleNotification = {
      lifecycleEvent: 'missed',
      subscriptionId: 'f67bdbb0-…',
      subscriptionExpirationDateTime: '2026-05-03T07:53:01.806Z',
      clientState: 'secret',
      resource: 'users/event@le-robin.fr/mailFolders/inbox/messages',
    }
    expect(isLifecycleNotification(lifecycle)).toBe(true)
  })

  it('reconnaît "subscriptionRemoved"', () => {
    expect(isLifecycleNotification({
      lifecycleEvent: 'subscriptionRemoved',
      subscriptionId: 'sub-id',
    })).toBe(true)
  })

  it('reconnaît "reauthorizationRequired"', () => {
    expect(isLifecycleNotification({
      lifecycleEvent: 'reauthorizationRequired',
      subscriptionId: 'sub-id',
    })).toBe(true)
  })

  it('renvoie false pour une notification regular', () => {
    const regular: GraphRegularNotification = {
      subscriptionId: 'f67bdbb0-…',
      clientState: 'secret',
      changeType: 'created',
      resourceData: { id: 'AAMk…' },
    }
    expect(isLifecycleNotification(regular)).toBe(false)
  })

  it('renvoie false pour null / undefined / scalaire', () => {
    expect(isLifecycleNotification(null)).toBe(false)
    expect(isLifecycleNotification(undefined)).toBe(false)
    expect(isLifecycleNotification('foo')).toBe(false)
    expect(isLifecycleNotification(42)).toBe(false)
    expect(isLifecycleNotification([])).toBe(false)
  })

  it('renvoie false pour un objet sans lifecycleEvent', () => {
    expect(isLifecycleNotification({ subscriptionId: 'x', clientState: 'y' })).toBe(false)
  })
})
