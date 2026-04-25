import type { NormalizedEmail } from '@/lib/email/types'
import type { FilterDecision } from './types'

const SPAM_HEADER_PREFIXES = [
  'list-unsubscribe',
  'list-unsubscribe-post',
  'x-auto-response-suppress',
  'x-campaign',
  'x-mailgun',
  'x-sendgrid',
  'x-mailchimp',
]

const NOREPLY_RE = /^(noreply|no-reply|do-not-reply|newsletter|marketing|notifications?|alerts?|no_reply)@/i

export function checkSpamHeaders(message: NormalizedEmail): FilterDecision | null {
  const headerKeys = Object.keys(message.headers)

  for (const prefix of SPAM_HEADER_PREFIXES) {
    if (headerKeys.some(k => k.startsWith(prefix))) {
      return { action: 'reject', rejectReason: 'spam_headers', details: prefix }
    }
  }

  const autoSubmitted = message.headers['auto-submitted']
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') {
    return { action: 'reject', rejectReason: 'spam_headers', details: `Auto-Submitted: ${autoSubmitted}` }
  }

  const precedence = message.headers['precedence']
  if (precedence && ['bulk', 'list'].includes(precedence.toLowerCase())) {
    return { action: 'reject', rejectReason: 'spam_headers', details: `Precedence: ${precedence}` }
  }

  if (NOREPLY_RE.test(message.from.address)) {
    return { action: 'reject', rejectReason: 'noreply_sender', details: message.from.address }
  }

  return null
}
