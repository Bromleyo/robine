/**
 * Helpers purs extraits du webhook handler `/api/webhooks/graph` pour faciliter
 * les tests unitaires. Voir src/app/api/webhooks/graph/route.ts pour l'usage.
 */

export type GraphLifecycleEvent = 'missed' | 'subscriptionRemoved' | 'reauthorizationRequired'

export interface GraphLifecycleNotification {
  lifecycleEvent: GraphLifecycleEvent
  subscriptionId: string
  clientState?: string
  subscriptionExpirationDateTime?: string
  resource?: string
}

export interface GraphRegularNotification {
  subscriptionId: string
  clientState: string
  changeType: string
  resourceData: { id: string }
}

/**
 * Détecte si un item du body Graph est une notification de cycle de vie
 * (missed / subscriptionRemoved / reauthorizationRequired) plutôt qu'un
 * change-event régulier.
 */
export function isLifecycleNotification(n: unknown): n is GraphLifecycleNotification {
  return !!n
    && typeof n === 'object'
    && typeof (n as { lifecycleEvent?: string }).lifecycleEvent === 'string'
}

/**
 * Pour les subscriptions sur boîte partagée, la subscription Graph cible
 * `sharedMailboxEmail` (ex: event@le-robin.fr) alors que la mailbox row
 * stocke `email` = compte utilisateur (ex: info@le-robin.fr). Le fetch Graph
 * doit utiliser la cible réelle de la subscription.
 */
export function resolveTargetMailbox(mailbox: { email: string; sharedMailboxEmail?: string | null }): string {
  return mailbox.sharedMailboxEmail ?? mailbox.email
}
