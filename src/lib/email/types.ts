export interface NormalizedEmail {
  providerMessageId: string
  internetMessageId: string
  conversationId: string | null
  subject: string | null
  from: { address: string; name: string | null }
  toRecipients: string[]
  ccRecipients: string[]
  bodyHtml: string | null
  bodyText: string
  receivedAt: Date
  headers: Record<string, string>
  inReplyTo: string | null
  references: string[]
}
