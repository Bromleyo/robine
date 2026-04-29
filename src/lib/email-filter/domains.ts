export const BLACKLISTED_SENDER_EMAILS = [
  'jimmy.dubreuil@gmail.com',
]

// Clients réels qui déclenchent systématiquement des faux positifs LLM
export const KNOWN_FALSE_POSITIVE_EMAILS = [
  'cachaca.rio@gmail.com',
]

// Patterns d'expéditeurs automatisés non couverts par NOREPLY_RE de la couche 2.
// La couche 2 gère déjà : noreply@, no-reply@, newsletter@, notifications@, etc.
export const BLACKLISTED_SENDER_PATTERNS: RegExp[] = [
  /^bonjour@e\./i,            // ESP : bonjour@e.backmarket.fr
  /^campaigns@/i,              // marketing : campaigns@mail.bizay.com
  /^shop@mail\./i,             // distrib alimentaire : shop@mail.gilac.com
  /^webmaster-/i,              // CMS auto : webmaster-cr@richard.fr
  /^make-events@/i,            // Make.com : make-events@make.com
  /^no-reply-[^@]+@/i,         // variante : no-reply-groupeup@e-facture.net
  /@n\.[a-z0-9-]+\.[a-z]{2,}$/i, // sous-domaine ESP "n.<marque>.tld" : @n.retif.eu
]

export const PROSPECTION_DOMAINS = [
  'hubspot.com', 'mailchimp.com', 'sendinblue.com', 'brevo.com',
  'lemlist.com', 'woodpecker.co', 'outreach.io', 'salesloft.com',
  'apollo.io', 'sellsy.com', 'pipedrive.com', 'mixmax.com',
  'reply.io', 'mailshake.com', 'snov.io', 'hunter.io',
  'lafourchette.com', 'thefork.com', 'yelp.com', 'tripadvisor.fr', 'tripadvisor.com',
  'getresponse.com', 'activecampaign.com', 'klaviyo.com',
  'constantcontact.com', 'campaignmonitor.com',
  // faux positifs confirmés
  'eurovolailles.fr', 'iscod.fr', 'proweltek.com',
  'habitium.com', 'piecesauto24.com', 'em.edenred.fr',
  // admin RH / médecine du travail
  'acms.asso.fr',
  // transactions financières
  'paypal.fr', 'paypal.com',
  // fournisseurs (emails automatisés factures/relevés)
  'ledelas.fr',
  // transactionnels / ESPs fournisseurs (découverts 2026-04-29)
  'traqfood.com',    // logiciel traçabilité
  'e-facture.net',   // plateforme factures auto
  'mail.gilac.com',  // sous-domaine marketing Gilac (distrib alimentaire)
  'n.retif.eu',      // sous-domaine ESP Retif (fournitures CHR)
]
