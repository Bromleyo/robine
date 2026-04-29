import type { NormalizedEmail } from '../email/types'
import type { FilterDecision } from './types'
import { checkSpamHeaders } from './layer2-headers'
import { checkBusinessSignals } from './layer3-business'
import { PROSPECTION_PHRASES, EVENT_KEYWORDS } from './keywords'
import { PROSPECTION_DOMAINS } from './domains'

export type DebugLayer1 =
  | { passed: true }
  | { passed: false; decision: FilterDecision }

export type DebugLayer2 =
  | { passed: true }
  | { passed: false; decision: FilterDecision }

export type DebugLayer3 = {
  decision: FilterDecision
  matchedStrong: string[]
  matchedMedium: string[]
  dateDetected: boolean
  guestCount: number | null
  prospectionPhrase: string | null
  blacklistedDomain: string | null
}

export type FilterDebugResult = {
  receivedAt: Date
  from: string
  subject: string | null
  snippet: string
  layer1: DebugLayer1
  layer2: DebugLayer2
  layer3: DebugLayer3 | null
  finalAction: 'accept_direct' | 'send_to_llm' | 'reject'
  finalReason: string
  finalDetails?: string
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function detectGuestCount(normText: string): number | null {
  const m = normText.match(/(\d+)\s*(personnes?|invites?|convives?|pax|couverts?)|pour\s+(\d+)|groupe\s+de\s+(\d+)/)
  if (!m) return null
  const n = parseInt(m[1] ?? m[3] ?? m[4] ?? '0')
  return n >= 10 ? n : null
}

function detectFutureDate(normText: string): boolean {
  return [
    /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/,
    /\b\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/,
    /\ble\s+\d{1,2}\s+\w+/,
  ].some(p => p.test(normText))
}

export function filterEmailDebug(email: NormalizedEmail, mailboxEmail: string): FilterDebugResult {
  const snippet = email.bodyText.slice(0, 200).replace(/\n+/g, ' ').trim()

  const l2decision = checkSpamHeaders(email)
  if (l2decision) {
    return {
      receivedAt: email.receivedAt,
      from: email.from.address,
      subject: email.subject,
      snippet,
      layer1: { passed: true },
      layer2: { passed: false, decision: l2decision },
      layer3: null,
      finalAction: 'reject',
      finalReason: `L2: ${'rejectReason' in l2decision ? l2decision.rejectReason : ''}`,
      finalDetails: 'details' in l2decision ? l2decision.details : undefined,
    }
  }

  const searchText = normalizeText(`${email.subject ?? ''} ${email.bodyText.slice(0, 2000)}`)
  const fromDomain = email.from.address.split('@')[1]?.toLowerCase() ?? ''

  const debugLayer3: DebugLayer3 = {
    decision: checkBusinessSignals(email, email.bodyText),
    matchedStrong: EVENT_KEYWORDS.strong.filter(kw => searchText.includes(kw)),
    matchedMedium: EVENT_KEYWORDS.medium.filter(kw => searchText.includes(kw)),
    dateDetected: detectFutureDate(searchText),
    guestCount: detectGuestCount(searchText),
    prospectionPhrase: PROSPECTION_PHRASES.find(p => searchText.includes(p)) ?? null,
    blacklistedDomain: PROSPECTION_DOMAINS.includes(fromDomain) ? fromDomain : null,
  }

  const d = debugLayer3.decision
  const finalAction = d.action
  let finalReason: string
  let finalDetails: string | undefined

  if (d.action === 'reject') {
    finalReason = `L3: ${d.rejectReason}`
    finalDetails = d.details
  } else if (d.action === 'accept_direct') {
    finalReason = `L3: ${d.reason}`
  } else {
    finalReason = `L3: ${d.reason}`
    if (d.softRejectReason) finalDetails = d.softRejectReason
  }

  return {
    receivedAt: email.receivedAt,
    from: email.from.address,
    subject: email.subject,
    snippet,
    layer1: { passed: true },
    layer2: { passed: true },
    layer3: debugLayer3,
    finalAction,
    finalReason,
    finalDetails,
  }
}
