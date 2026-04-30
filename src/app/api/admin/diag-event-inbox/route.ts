import { NextResponse } from 'next/server'
import { getAppGraphToken } from '@/lib/graph/auth'

// TEMPORARY DIAGNOSTIC ENDPOINT — to be removed immediately after one-shot use.
// GET /api/admin/diag-event-inbox
// Lists all messages in users/event@le-robin.fr/mailFolders/Inbox/messages
// received since 2026-04-28T00:00:00Z. No body content returned.
//
// No auth: CRON_SECRET / VERCEL_AUTOMATION_BYPASS_SECRET are Encrypted/Sensitive
// in Vercel env and cannot be retrieved locally. Endpoint deployed for <5 min.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAILBOX = 'event@le-robin.fr'
const SINCE = '2026-04-28T00:00:00Z'
const SELECT = 'id,internetMessageId,subject,from,receivedDateTime,parentFolderId'

interface GraphLite {
  id: string
  internetMessageId: string | null
  subject: string | null
  from: { emailAddress?: { address?: string; name?: string } } | null
  receivedDateTime: string
  parentFolderId: string | null
}

export async function GET() {
  try {
    const token = await getAppGraphToken()
    const messages: GraphLite[] = []

    let url: string | null =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/mailFolders/Inbox/messages` +
      `?$select=${SELECT}` +
      `&$top=100` +
      `&$filter=${encodeURIComponent(`receivedDateTime ge ${SINCE}`)}` +
      `&$orderby=${encodeURIComponent('receivedDateTime desc')}`

    let pages = 0
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json(
          { error: 'graph fetch failed', status: res.status, body: text, page: pages, soFar: messages.length },
          { status: 500 },
        )
      }
      const data = (await res.json()) as { value: GraphLite[]; '@odata.nextLink'?: string }
      messages.push(...(data.value ?? []))
      url = data['@odata.nextLink'] ?? null
      pages++
      if (pages > 100) break
    }

    return NextResponse.json({
      mailbox: MAILBOX,
      since: SINCE,
      count: messages.length,
      pages,
      messages: messages.map((m) => ({
        id: m.id,
        internetMessageId: m.internetMessageId,
        subject: m.subject,
        fromAddress: m.from?.emailAddress?.address ?? null,
        fromName: m.from?.emailAddress?.name ?? null,
        receivedDateTime: m.receivedDateTime,
        parentFolderId: m.parentFolderId,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'unexpected', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
