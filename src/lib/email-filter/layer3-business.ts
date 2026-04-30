import type { NormalizedEmail } from '@/lib/email/types'
import type { FilterDecision, RejectReason } from './types'
import { PROSPECTION_DOMAINS } from './domains'
import { PROSPECTION_PHRASES_STRONG, PROSPECTION_PHRASES_WEAK, EVENT_KEYWORDS } from './keywords'

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

  const matchedStrongProspection = PROSPECTION_PHRASES_STRONG.filter(p => searchText.includes(p))
  const matchedWeakProspection = PROSPECTION_PHRASES_WEAK.filter(p => searchText.includes(p))
  const matchedStrongEvent = EVENT_KEYWORDS.strong.filter(kw => searchText.includes(kw))
  const matchedMediumEvent = EVENT_KEYWORDS.medium.filter(kw => searchText.includes(kw))
  const hasEventKeyword = matchedStrongEvent.length > 0 || matchedMediumEvent.length > 0

  // Cas 1 — STRONG prospection matchée
  if (matchedStrongProspection.length > 0) {
    if (hasEventKeyword) {
      // Filet : un commercial peut camoufler son pitch derrière un mot événement.
      return {
        action: 'send_to_llm',
        reason: 'ambiguous: strong prospection phrase + event keyword',
        softRejectReason: `strong prospection phrase matched: "${matchedStrongProspection[0]}"`,
      }
    }
    return { action: 'reject', rejectReason: 'prospection', details: matchedStrongProspection[0] }
  }

  // Cas 2 — 2+ WEAK seuls (sans event keyword) → LLM softReject
  if (matchedWeakProspection.length >= 2 && !hasEventKeyword) {
    return {
      action: 'send_to_llm',
      reason: 'multiple weak prospection phrases without event keyword',
      softRejectReason: `weak prospection phrases matched: ${matchedWeakProspection.join(' | ')}`,
    }
  }

  // Cas 3 — 1 WEAK seul OU WEAK + event : continue scoring normal.
  // WEAK + event → ACCEPT direct via le scoring ci-dessous (event wins).
  // 1 WEAK seul sans event → fallback final send_to_llm.

  if (matchedStrongEvent.length > 0) {
    return { action: 'accept_direct', reason: 'strong event keyword', matchedKeywords: matchedStrongEvent }
  }

  if (matchedMediumEvent.length >= 2) {
    return { action: 'accept_direct', reason: '2+ medium event keywords', matchedKeywords: matchedMediumEvent }
  }
  if (matchedMediumEvent.length === 1 && (hasFutureDate(searchText) || hasGuestCount(searchText))) {
    return { action: 'accept_direct', reason: '1 medium keyword + date or guest count', matchedKeywords: matchedMediumEvent }
  }

  return { action: 'send_to_llm', reason: 'no strong signal, LLM decides' }
}
