import type { NormalizedEmail } from '@/lib/email/types'
import type { FilterDecision, RejectReason } from './types'
import { PROSPECTION_DOMAINS } from './domains'
import { PROSPECTION_PHRASES, EVENT_KEYWORDS } from './keywords'

// Empty — populate case-by-case when subject-based hard rejects are needed
const SUBJECT_HARD_REJECT: Array<{ pattern: RegExp; rejectReason: RejectReason; details: string }> = []

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function hasGuestCount(normText: string): boolean {
  const m = normText.match(/(\d+)\s*(personnes?|invites?|convives?|pax|couverts?)|pour\s+(\d+)|groupe\s+de\s+(\d+)/)
  if (!m) return false
  const n = parseInt(m[1] ?? m[3] ?? m[4] ?? '0')
  return n >= 10
}

function hasFutureDate(normText: string): boolean {
  const datePatterns = [
    /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/,
    /\b\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/,
    /\ble\s+\d{1,2}\s+\w+/,
  ]
  return datePatterns.some(p => p.test(normText))
}

export function checkBusinessSignals(message: NormalizedEmail, bodyText: string): FilterDecision {
  const normSubject = normalize(message.subject ?? '')
  for (const rule of SUBJECT_HARD_REJECT) {
    if (rule.pattern.test(normSubject)) {
      return { action: 'reject', rejectReason: rule.rejectReason, details: rule.details }
    }
  }

  const fromDomain = message.from.address.split('@')[1]?.toLowerCase()
  if (fromDomain && PROSPECTION_DOMAINS.includes(fromDomain)) {
    return { action: 'reject', rejectReason: 'blacklisted_domain', details: fromDomain }
  }

  const searchText = normalize(`${message.subject ?? ''} ${bodyText.slice(0, 2000)}`)

  for (const phrase of PROSPECTION_PHRASES) {
    if (searchText.includes(phrase)) {
      const hasStrong = EVENT_KEYWORDS.strong.some(kw => searchText.includes(kw))
      if (hasStrong) {
        return {
          action: 'send_to_llm',
          reason: 'ambiguous: prospection phrase + strong event keyword',
          softRejectReason: `prospection phrase matched: "${phrase}"`,
        }
      }
      const hasMedium = EVENT_KEYWORDS.medium.some(kw => searchText.includes(kw))
      if (hasMedium) {
        return {
          action: 'send_to_llm',
          reason: 'ambiguous: prospection phrase + medium event keyword',
          softRejectReason: `prospection phrase matched: "${phrase}"`,
        }
      }
      return { action: 'reject', rejectReason: 'prospection', details: phrase }
    }
  }

  const matchedStrong = EVENT_KEYWORDS.strong.filter(kw => searchText.includes(kw))
  if (matchedStrong.length > 0) {
    return { action: 'accept_direct', reason: 'strong event keyword', matchedKeywords: matchedStrong }
  }

  const matchedMedium = EVENT_KEYWORDS.medium.filter(kw => searchText.includes(kw))
  if (matchedMedium.length >= 2) {
    return { action: 'accept_direct', reason: '2+ medium event keywords', matchedKeywords: matchedMedium }
  }
  if (matchedMedium.length === 1 && (hasFutureDate(searchText) || hasGuestCount(searchText))) {
    return { action: 'accept_direct', reason: '1 medium keyword + date or guest count', matchedKeywords: matchedMedium }
  }

  return { action: 'send_to_llm', reason: 'no strong signal, LLM decides' }
}
