import { NextRequest, NextResponse } from 'next/server'
import { getAppGraphToken } from '@/lib/graph/auth'

// TEMPORARY DIAGNOSTIC ENDPOINT — to be removed after one-shot use.
// GET /api/admin/diag-subscription?id=<subscriptionId>
// No auth (CRON_SECRET is Encrypted/Sensitive in Vercel and can't be retrieved
// locally). Endpoint is read-only and Graph redacts clientState in responses.
// Will be removed immediately after one-shot use.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const token = await getAppGraphToken()
  const res = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const text = await res.text()
  let parsed: unknown = null
  try { parsed = JSON.parse(text) } catch { parsed = text }

  return NextResponse.json({
    httpStatus: res.status,
    body: parsed,
    expectedNotificationUrl: `${process.env.NEXTAUTH_URL ?? '<unset>'}/api/webhooks/graph`,
    expectedClientStateLength: (process.env.MS_GRAPH_WEBHOOK_SECRET ?? '').length,
  })
}
