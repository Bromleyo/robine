import type { NormalizedEmail } from '@/lib/email/types'
import type { FilterDecision } from './types'
import { BLACKLISTED_SENDER_EMAILS, KNOWN_FALSE_POSITIVE_EMAILS, BLACKLISTED_SENDER_PATTERNS } from './domains'

export type ExtraBlacklist = {
  senders?: string[]
  domains?: string[]
}

export function checkBlacklistedSender(
  email: NormalizedEmail,
  extra?: ExtraBlacklist,
): FilterDecision | null {
  const addr = email.from.address.toLowerCase()
  const domain = addr.includes('@') ? addr.slice(addr.lastIndexOf('@') + 1) : ''

  // Blacklist dynamique gérée par l'utilisateur depuis l'UI ("Pas une demande" → ajouter)
  const extraSenders = (extra?.senders ?? []).map(s => s.toLowerCase())
  const extraDomains = (extra?.domains ?? []).map(d => d.toLowerCase())
  if (extraSenders.includes(addr)) {
    return { action: 'reject', rejectReason: 'manual_blacklist', details: `manually blacklisted sender: ${email.from.address}` }
  }
  if (domain && extraDomains.includes(domain)) {
    return { action: 'reject', rejectReason: 'manual_blacklist', details: `manually blacklisted domain: ${domain}` }
  }

  if (BLACKLISTED_SENDER_EMAILS.includes(addr)) {
    return { action: 'reject', rejectReason: 'test_email', details: `blacklisted sender: ${email.from.address}` }
  }
  if (KNOWN_FALSE_POSITIVE_EMAILS.includes(addr)) {
    return { action: 'reject', rejectReason: 'known_false_positive', details: `known false positive sender: ${email.from.address}` }
  }
  for (const pattern of BLACKLISTED_SENDER_PATTERNS) {
    if (pattern.test(addr)) {
      return { action: 'reject', rejectReason: 'noreply_sender', details: `auto sender pattern: ${email.from.address}` }
    }
  }
  return null
}

export function checkAddressing(message: NormalizedEmail, mailboxEmail: string): FilterDecision | null {
  const addressLower = mailboxEmail.toLowerCase()
  const allRecipients = [
    ...message.toRecipients.map(e => e.toLowerCase()),
    ...message.ccRecipients.map(e => e.toLowerCase()),
  ]
  if (!allRecipients.includes(addressLower)) {
    return { action: 'reject', rejectReason: 'not_addressed', details: `${mailboxEmail} not in to/cc` }
  }
  return null
}
