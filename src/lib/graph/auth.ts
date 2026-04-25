const TOKEN_URL = `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`

let cache: { value: string; expiresAt: number } | null = null

export async function getAppGraphToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt - 60_000) return cache.value

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })

  if (!res.ok) throw new Error(`Graph token error: ${await res.text()}`)

  const data = await res.json() as { access_token: string; expires_in: number }
  cache = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cache.value
}
