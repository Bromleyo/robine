import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'
import { getAppGraphToken } from '@/lib/graph/auth'
import { htmlToText } from '@/lib/email/html-to-text'

export const maxDuration = 60

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const SPAM_PATTERNS = [
  'noreply@', 'no-reply@', 'newsletter@', 'marketing@',
  'notification@', 'donotreply@', 'mailer-daemon@', 'postmaster@',
]

const SUBJECT_KEYWORDS = [
  'privatisation', 'privatiser', 'mariage', 'noces', 'séminaire',
  'seminaire', 'cocktail', 'anniversaire', 'baptême', 'bapteme',
  'communion', 'enterrement', 'groupe', 'événement', 'evenement',
  'devis', 'réception', 'reception', 'convives', 'couverts',
]

interface MsgRaw {
  id: string
  conversationId: string
  subject: string
  from: { emailAddress: { address: string } }
  receivedDateTime: string
  body: { contentType: 'html' | 'text'; content: string }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const body = await req.json() as { mailboxId?: string }
  if (!body.mailboxId) {
    return NextResponse.json({ error: 'mailboxId requis' }, { status: 400 })
  }

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { id: body.mailboxId, restaurantId: session.user.restaurantId },
    select: { id: true, email: true },
  })
  if (!mailbox) {
    return NextResponse.json({ error: 'Mailbox introuvable' }, { status: 404 })
  }

  const token = await getAppGraphToken()
  const mailboxEmail = mailbox.email

  const kql = SUBJECT_KEYWORDS.map(k => `subject:${k}`).join(' OR ')
  const selectFields = 'id,conversationId,subject,from,receivedDateTime,body'
  const searchParam = encodeURIComponent(`"${kql}"`)
  const baseUrl = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxEmail)}/messages?$search=${searchParam}&$select=${selectFields}&$top=100`

  let nextUrl: string | null = baseUrl
  const allMessages: MsgRaw[] = []
  let pageCount = 0

  while (nextUrl && pageCount < 15) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const text = await res.text()
      console.error('[fetch-threads] Graph error', res.status, text)
      return NextResponse.json({ error: 'Erreur Graph API', detail: text }, { status: 502 })
    }
    const data = await res.json() as { value: MsgRaw[]; '@odata.nextLink'?: string }
    allMessages.push(...(data.value ?? []))
    nextUrl = data['@odata.nextLink'] ?? null
    pageCount++
  }

  const totalFetched = allMessages.length

  const since12m = new Date()
  since12m.setFullYear(since12m.getFullYear() - 1)

  const filtered = allMessages.filter(msg => {
    if (new Date(msg.receivedDateTime) < since12m) return false
    const from = msg.from.emailAddress.address.toLowerCase()
    return !SPAM_PATTERNS.some(p => from.includes(p))
  })

  type ThreadAcc = {
    conversationId: string
    subject: string
    senderEmail: string
    firstMessageDate: string
    firstMessagePreview: string
    messageCount: number
    hasReplyFromUs: boolean
  }

  const threadMap = new Map<string, ThreadAcc>()

  for (const msg of filtered) {
    const cid = msg.conversationId
    if (!cid) continue

    const fromAddr = msg.from.emailAddress.address.toLowerCase()
    const isFromMailbox = fromAddr === mailboxEmail.toLowerCase()

    if (!threadMap.has(cid)) {
      const bodyText = msg.body.contentType === 'html' ? htmlToText(msg.body.content) : msg.body.content
      threadMap.set(cid, {
        conversationId: cid,
        subject: msg.subject,
        senderEmail: msg.from.emailAddress.address,
        firstMessageDate: msg.receivedDateTime,
        firstMessagePreview: bodyText.slice(0, 250),
        messageCount: 0,
        hasReplyFromUs: false,
      })
    }

    const acc = threadMap.get(cid)!
    acc.messageCount++
    if (isFromMailbox) acc.hasReplyFromUs = true

    if (new Date(msg.receivedDateTime) < new Date(acc.firstMessageDate)) {
      acc.firstMessageDate = msg.receivedDateTime
      if (!isFromMailbox) {
        acc.senderEmail = msg.from.emailAddress.address
        const bodyText = msg.body.contentType === 'html' ? htmlToText(msg.body.content) : msg.body.content
        acc.firstMessagePreview = bodyText.slice(0, 250)
      }
    }
  }

  const afterAutoFilter = threadMap.size

  const allThreads = Array.from(threadMap.values())
  const rejectedNoReplyFromUs = allThreads.filter(t => !t.hasReplyFromUs).length
  const rejectedTooFewMessages = allThreads.filter(t => t.hasReplyFromUs && t.messageCount < 2).length

  const threads = allThreads
    .filter(t => t.messageCount >= 2 && t.hasReplyFromUs)
    .sort((a, b) => b.messageCount - a.messageCount)

  const rejectionStats = {
    rejectedNoReplyFromUs,
    rejectedTooFewMessages,
    rejectedAutoFilter: totalFetched - filtered.length,
  }

  const rejectedThreads = allThreads.filter(t => !(t.messageCount >= 2 && t.hasReplyFromUs))
  const shuffled = rejectedThreads.map(t => t.subject).sort(() => Math.random() - 0.5)
  const sampleRejectedSubjects = shuffled.slice(0, 10)

  const now = new Date()
  const diagnostics = {
    totalMessagesFromGraph: totalFetched,
    uniqueThreads: threadMap.size,
    rejectionBreakdown: {
      autoFilteredSenders: totalFetched - filtered.length,
      noReplyFromUs: rejectedNoReplyFromUs,
      tooFewMessages: allThreads.filter(t => t.hasReplyFromUs && t.messageCount < 3).length,
    },
    searchKeywordsUsed: SUBJECT_KEYWORDS,
    dateRangeStart: since12m.toISOString(),
    dateRangeEnd: now.toISOString(),
    sampleRejectedSubjects,
  }

  return NextResponse.json({ threads, totalFetched, afterAutoFilter, rejectionStats, diagnostics })
}
