import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { getAppGraphToken } from '@/lib/graph/auth'
import { htmlToText } from '@/lib/email/html-to-text'
import { requireRole } from '@/lib/auth/require-role'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SELECT = 'id,conversationId,subject,from,body,receivedDateTime,sentDateTime'
const PAGE_SIZE = 50
const MAX_MSGS = 500

interface RawMsg {
  id: string
  conversationId: string
  subject: string
  from: { emailAddress: { name: string; address: string } }
  body: { contentType: string; content: string }
  receivedDateTime?: string
  sentDateTime?: string
}

async function resolveFolderId(mailbox: string, token: string, folderName: string): Promise<string | null> {
  const url = `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/mailFolders?$filter=${encodeURIComponent(`displayName eq '${folderName}'`)}&$top=1`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = await res.json() as { value: { id: string }[] }
  return data.value[0]?.id ?? null
}

async function fetchFolderMessages(mailbox: string, token: string, folderId: string): Promise<RawMsg[]> {
  const results: RawMsg[] = []
  let url: string | null =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/mailFolders/${folderId}/messages` +
    `?$select=${SELECT}&$top=${PAGE_SIZE}&$orderby=${encodeURIComponent('receivedDateTime asc')}`

  while (url && results.length < MAX_MSGS) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) break
    const data = await res.json() as { value: RawMsg[]; '@odata.nextLink'?: string }
    results.push(...data.value)
    url = data['@odata.nextLink'] ?? null
  }

  return results
}

async function fetchSentItems(mailbox: string, token: string, sinceIso: string): Promise<RawMsg[]> {
  const results: RawMsg[] = []
  let url: string | null =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/mailFolders/SentItems/messages` +
    `?$select=${SELECT}&$filter=${encodeURIComponent(`sentDateTime ge ${sinceIso}`)}&$top=${PAGE_SIZE}`

  while (url && results.length < MAX_MSGS) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) break
    const data = await res.json() as { value: RawMsg[]; '@odata.nextLink'?: string }
    results.push(...data.value)
    url = data['@odata.nextLink'] ?? null
  }

  return results
}

async function fetchConversationMessages(mailbox: string, token: string, conversationId: string): Promise<RawMsg[]> {
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$select=${SELECT}&$filter=${encodeURIComponent(`conversationId eq '${conversationId}'`)}&$top=50`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return []
  const data = await res.json() as { value: RawMsg[] }
  return data.value ?? []
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId

  const mailboxes = await prisma.outlookMailbox.findMany({
    where: { restaurantId, actif: true },
    select: { email: true, ragFolderName: true },
  })
  if (mailboxes.length === 0) {
    return NextResponse.json({ error: 'Aucune boîte mail configurée' }, { status: 400 })
  }

  const mailboxEmails = new Set(mailboxes.map(m => m.email.toLowerCase()))

  let token: string
  try {
    token = await getAppGraphToken()
  } catch {
    return NextResponse.json({ error: 'Erreur token Graph' }, { status: 500 })
  }

  const existingGraphIds = new Set(
    (await prisma.conversationExample.findMany({
      where: { restaurantId },
      select: { graphConversationId: true },
    })).map(e => e.graphConversationId),
  )

  // Map convId → { mailbox, msgs[] }
  const convMap = new Map<string, { mailbox: string; msgs: RawMsg[] }>()

  for (const { email, ragFolderName } of mailboxes) {
    if (ragFolderName) {
      // Folder approach: pull all messages from the dedicated RAG folder
      const folderId = await resolveFolderId(email, token, ragFolderName)
      if (!folderId) continue

      const msgs = await fetchFolderMessages(email, token, folderId)
      for (const msg of msgs) {
        if (!msg.conversationId) continue
        if (!convMap.has(msg.conversationId)) {
          convMap.set(msg.conversationId, { mailbox: email, msgs: [] })
        }
        convMap.get(msg.conversationId)!.msgs.push(msg)
      }
    } else {
      // Fallback: SentItems-first — only conversations we replied to
      const sinceIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      const sent = await fetchSentItems(email, token, sinceIso)
      for (const msg of sent) {
        if (msg.conversationId && !convMap.has(msg.conversationId)) {
          convMap.set(msg.conversationId, { mailbox: email, msgs: [] })
        }
      }
    }
  }

  let created = 0
  let skipped = 0

  for (const [convId, entry] of convMap) {
    if (existingGraphIds.has(convId)) { skipped++; continue }

    // For SentItems fallback, msgs array is empty — fetch the full thread
    const msgs = entry.msgs.length > 0
      ? entry.msgs
      : await fetchConversationMessages(entry.mailbox, token, convId)

    if (msgs.length === 0) { skipped++; continue }

    const deduped = Array.from(new Map(msgs.map(m => [m.id, m])).values())
    deduped.sort((a, b) => {
      const da = new Date(a.receivedDateTime ?? a.sentDateTime ?? 0).getTime()
      const db = new Date(b.receivedDateTime ?? b.sentDateTime ?? 0).getTime()
      return da - db
    })

    const hasIn = deduped.some(m => !mailboxEmails.has(m.from.emailAddress.address.toLowerCase()))
    const hasOut = deduped.some(m => mailboxEmails.has(m.from.emailAddress.address.toLowerCase()))
    if (!hasIn || !hasOut) { skipped++; continue }

    const first = deduped[0]!
    const startDate = new Date(first.receivedDateTime ?? first.sentDateTime ?? Date.now())
    const inbound = deduped.find(m => !mailboxEmails.has(m.from.emailAddress.address.toLowerCase()))
    const contactEmail = inbound?.from.emailAddress.address ?? first.from.emailAddress.address
    const contactName = inbound?.from.emailAddress.name ?? null

    try {
      await prisma.conversationExample.create({
        data: {
          restaurantId,
          graphConversationId: convId,
          status: 'PENDING',
          subject: first.subject ?? '(sans objet)',
          contactEmail,
          contactName,
          startDate,
          messageCount: deduped.length,
          messages: {
            create: deduped.map(m => {
              const isOut = mailboxEmails.has(m.from.emailAddress.address.toLowerCase())
              const rawBody = m.body.contentType === 'html' ? htmlToText(m.body.content) : m.body.content
              return {
                direction: isOut ? 'OUT' : 'IN',
                fromEmail: m.from.emailAddress.address,
                fromName: m.from.emailAddress.name ?? null,
                bodyText: rawBody.slice(0, 4000),
                sentAt: new Date(m.receivedDateTime ?? m.sentDateTime ?? Date.now()),
              }
            }),
          },
        },
      })
      created++
      existingGraphIds.add(convId)
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ created, skipped })
}
