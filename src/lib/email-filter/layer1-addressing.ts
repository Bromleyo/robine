import type { NormalizedEmail } from '@/lib/email/types'
import type { FilterDecision } from './types'
import { BLACKLISTED_SENDER_EMAILS, KNOWN_FALSE_POSITIVE_EMAILS } from './domains'

export function checkBlacklistedSender(email: NormalizedEmail): FilterDecision | null {
  const addr = email.from.address.toLowerCase()
  if (BLACKLISTED_SENDER_EMAILS.includes(addr)) {
    return { action: 'reject', rejectReason: 'test_email', details: `blacklisted sender: ${email.from.address}` }
  }
  if (KNOWN_FALSE_POSITIVE_EMAILS.includes(addr)) {
    return { action: 'reject', rejectReason: 'known_false_positive', details: `known false positive sender: ${email.from.address}` }
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
