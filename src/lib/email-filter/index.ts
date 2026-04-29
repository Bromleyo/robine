import type { NormalizedEmail } from '@/lib/email/types'
import type { FilterResult } from './types'
import { checkBlacklistedSender, type ExtraBlacklist } from './layer1-addressing'
import { checkSpamHeaders } from './layer2-headers'
import { checkBusinessSignals } from './layer3-business'
import { extractBasicFields } from './extract-basic'

export type { FilterDecision, FilterResult, RejectReason } from './types'
export type { ExtraBlacklist } from './layer1-addressing'

export type FilterOptions = {
  extraBlacklist?: ExtraBlacklist
}

export function filterEmail(
  email: NormalizedEmail,
  mailboxEmail: string,
  options?: FilterOptions,
): FilterResult {
  const l1 = checkBlacklistedSender(email, options?.extraBlacklist)
  if (l1) return { decision: l1 }

  const l2 = checkSpamHeaders(email)
  if (l2) return { decision: l2 }

  const l3 = checkBusinessSignals(email, email.bodyText)

  if (l3.action === 'accept_direct') {
    return {
      decision: l3,
      extractedBasic: extractBasicFields(email.subject ?? '', email.bodyText),
    }
  }

  return { decision: l3 }
}
