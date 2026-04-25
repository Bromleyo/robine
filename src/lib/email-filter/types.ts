import type { TypeEvenement } from '@prisma/client'

export type RejectReason =
  | 'not_addressed'
  | 'spam_headers'
  | 'noreply_sender'
  | 'prospection'
  | 'blacklisted_domain'

export type FilterDecision =
  | { action: 'accept_direct'; reason: string; matchedKeywords: string[] }
  | { action: 'send_to_llm'; reason: string; softRejectReason?: string }
  | { action: 'reject'; rejectReason: RejectReason; details?: string }

export type FilterResult = {
  decision: FilterDecision
  extractedBasic?: {
    dateEvenement: Date | null
    nbInvites: number | null
    typeEvenement: TypeEvenement | null
  }
}
