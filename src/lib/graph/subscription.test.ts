import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock du token avant l'import du module sous test
vi.mock('./auth', () => ({
  getAppGraphToken: vi.fn(async () => 'fake-app-token'),
}))

import { createMailSubscription, createMailSubscriptionDelegated } from './subscription'

const fakeResponse = (body: unknown) => ({
  ok: true,
  json: async () => body,
} as unknown as Response)

describe('createMailSubscription (Fix #3 — lifecycleNotificationUrl)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({ id: 'sub-123', expirationDateTime: '2026-05-03T07:53:01.806Z' })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('inclut lifecycleNotificationUrl dans le body quand fourni', async () => {
    await createMailSubscription(
      'event@le-robin.fr',
      'https://example.com/webhook',
      'client-state-secret',
      'https://example.com/webhook-lifecycle',
    )

    const fetchSpy = vi.mocked(global.fetch)
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0]!
    const body = JSON.parse(init!.body as string)
    expect(body).toMatchObject({
      changeType: 'created',
      notificationUrl: 'https://example.com/webhook',
      lifecycleNotificationUrl: 'https://example.com/webhook-lifecycle',
      resource: 'users/event@le-robin.fr/mailFolders/inbox/messages',
      clientState: 'client-state-secret',
    })
    expect(body.expirationDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("n'inclut PAS lifecycleNotificationUrl quand omis (rétrocompat)", async () => {
    await createMailSubscription(
      'event@le-robin.fr',
      'https://example.com/webhook',
      'client-state-secret',
    )

    const fetchSpy = vi.mocked(global.fetch)
    const [, init] = fetchSpy.mock.calls[0]!
    const body = JSON.parse(init!.body as string)
    expect(body).not.toHaveProperty('lifecycleNotificationUrl')
  })

  it("encode l'URL Graph et utilise le token applicatif", async () => {
    await createMailSubscription('event@le-robin.fr', 'url', 'state', 'lifecycle-url')

    const fetchSpy = vi.mocked(global.fetch)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://graph.microsoft.com/v1.0/subscriptions')
    expect(init!.method).toBe('POST')
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer fake-app-token')
    expect(headers['Content-Type']).toBe('application/json')
  })
})

describe('createMailSubscriptionDelegated (Fix #3 — lifecycleNotificationUrl)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({ id: 'sub-456', expirationDateTime: '2026-05-03T07:53:01.806Z' })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('inclut lifecycleNotificationUrl quand fourni (5e arg, après targetEmail)', async () => {
    await createMailSubscriptionDelegated(
      'user-access-token',
      'https://example.com/webhook',
      'client-state',
      'event@le-robin.fr',
      'https://example.com/lifecycle',
    )

    const fetchSpy = vi.mocked(global.fetch)
    const [, init] = fetchSpy.mock.calls[0]!
    const body = JSON.parse(init!.body as string)
    expect(body).toMatchObject({
      lifecycleNotificationUrl: 'https://example.com/lifecycle',
      resource: 'users/event@le-robin.fr/mailFolders/inbox/messages',
    })
  })

  it("utilise 'me/mailFolders/inbox/messages' si targetEmail omis", async () => {
    await createMailSubscriptionDelegated(
      'user-access-token',
      'https://example.com/webhook',
      'client-state',
    )

    const fetchSpy = vi.mocked(global.fetch)
    const [, init] = fetchSpy.mock.calls[0]!
    const body = JSON.parse(init!.body as string)
    expect(body.resource).toBe('me/mailFolders/inbox/messages')
    expect(body).not.toHaveProperty('lifecycleNotificationUrl')
  })
})
