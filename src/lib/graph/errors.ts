/**
 * Erreurs structurées Microsoft Graph + helpers de catégorisation.
 *
 * Permet aux handlers API de catcher un échec Graph avec :
 *   - status HTTP retourné par Graph
 *   - error.code parsé depuis le body JSON (ex: "ErrorAccessDenied")
 *   - error.message parsé
 *   - mailbox cible et messageId pour debug
 *
 * Et de mapper le code Graph vers une réponse API catégorisée pour l'UI,
 * sans fuiter de stacktrace.
 */

export type GraphOperation =
  | 'createReply'
  | 'patchDraft'
  | 'sendDraft'
  | 'attachmentUpload'
  | 'fetchMessage'
  | 'createSubscription'
  | 'renewSubscription'

export class GraphRequestError extends Error {
  public readonly status: number
  public readonly graphCode: string | null
  public readonly graphMessage: string | null
  public readonly mailboxEmail: string
  public readonly graphMessageId: string | null
  public readonly operation: GraphOperation

  constructor(args: {
    status: number
    graphCode: string | null
    graphMessage: string | null
    mailboxEmail: string
    graphMessageId: string | null
    operation: GraphOperation
  }) {
    const summary = `[graph] ${args.operation} failed (${args.status}): ${args.graphCode ?? 'Unknown'} — ${args.graphMessage ?? 'no message'}`
    super(summary)
    this.name = 'GraphRequestError'
    this.status = args.status
    this.graphCode = args.graphCode
    this.graphMessage = args.graphMessage
    this.mailboxEmail = args.mailboxEmail
    this.graphMessageId = args.graphMessageId
    this.operation = args.operation
  }
}

export function parseGraphErrorBody(rawBody: string): {
  code: string | null
  message: string | null
} {
  try {
    const j = JSON.parse(rawBody) as { error?: { code?: string; message?: string } }
    return { code: j.error?.code ?? null, message: j.error?.message ?? null }
  } catch {
    return { code: null, message: null }
  }
}

/**
 * Mappe une GraphRequestError vers une réponse API structurée que l'UI
 * peut afficher sans avoir besoin d'aller fouiller dans Vercel runtime logs.
 */
export type CategorizedGraphError = {
  code: 'graph_permission_missing' | 'graph_message_not_found' | 'graph_throttled' | 'graph_error'
  kind: string
  hint: string
  httpStatus: number
}

export function categorizeGraphError(err: GraphRequestError): CategorizedGraphError {
  if (err.graphCode === 'ErrorAccessDenied' || err.status === 403) {
    return {
      code: 'graph_permission_missing',
      kind: 'GRAPH_PERMISSION_MISSING — vérifier Azure AD app permissions (Mail.ReadWrite + Mail.Send) et leur admin consent',
      hint: "L'application n'a pas les permissions Microsoft Graph nécessaires pour cette boîte. Contacte l'admin Azure AD.",
      httpStatus: 502,
    }
  }
  if (err.graphCode === 'ErrorItemNotFound' || err.status === 404) {
    return {
      code: 'graph_message_not_found',
      kind: 'GRAPH_MESSAGE_NOT_FOUND — le message source a été déplacé ou supprimé dans la mailbox cible',
      hint: "Le message d'origine n'existe plus dans la boîte source. Recharge la demande puis réessaye.",
      httpStatus: 502,
    }
  }
  if (err.status === 429) {
    return {
      code: 'graph_throttled',
      kind: 'GRAPH_THROTTLED — Microsoft Graph rate-limit atteint',
      hint: 'Microsoft Graph est temporairement saturé. Réessaye dans quelques secondes.',
      httpStatus: 502,
    }
  }
  return {
    code: 'graph_error',
    kind: `GRAPH_ERROR — operation=${err.operation} status=${err.status} code=${err.graphCode ?? 'unknown'}`,
    hint: "Erreur Microsoft Graph lors de l'opération. Voir les logs runtime pour détail.",
    httpStatus: 502,
  }
}
