import type { NormalizedEmail } from '@/lib/email/types'
import type { FilterDecision } from './types'
import { BLACKLISTED_SENDER_EMAILS } from './domains'

export function checkBlacklistedSender(email: NormalizedEmail): FilterDecision | null {
  if (BLACKLISTED_SENDER_EMAILS.includes(email.from.address.toLowerCase())) {
    return { action: 'reject', rejectReason: 'test_email', details: `blacklisted sender: ${email.from.address}` }
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
