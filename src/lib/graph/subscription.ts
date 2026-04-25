import { getAppGraphToken } from './auth'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export async function createMailSubscription(
  mailboxEmail: string,
  notificationUrl: string,
  clientState: string,
): Promise<{ id: string; expirationDateTime: string }> {
  const token = await getAppGraphToken()
  const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'created',
      notificationUrl,
      resource: `users/${mailboxEmail}/mailFolders/inbox/messages`,
      expirationDateTime,
      clientState,
    }),
  })

  if (!res.ok) throw new Error(`Subscription creation failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<{ id: string; expirationDateTime: string }>
}

// Uses a delegated (user) access token — resource is /me/... relative to token owner
export async function createMailSubscriptionDelegated(
  accessToken: string,
  notificationUrl: string,
  clientState: string,
): Promise<{ id: string; expirationDateTime: string }> {
  const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'created',
      notificationUrl,
      resource: 'me/mailFolders/inbox/messages',
      expirationDateTime,
      clientState,
    }),
  })

  if (!res.ok) throw new Error(`Subscription creation failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<{ id: string; expirationDateTime: string }>
}

export async function renewMailSubscription(subscriptionId: string): Promise<string> {
  const token = await getAppGraphToken()
  const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(`${GRAPH_BASE}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expirationDateTime }),
  })

  if (!res.ok) throw new Error(`Subscription renewal failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { expirationDateTime: string }
  return data.expirationDateTime
}
