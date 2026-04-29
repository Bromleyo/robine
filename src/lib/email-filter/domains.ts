export const BLACKLISTED_SENDER_EMAILS = [
  'jimmy.dubreuil@gmail.com',
]

// Clients réels qui déclenchent systématiquement des faux positifs LLM
export const KNOWN_FALSE_POSITIVE_EMAILS = [
  'cachaca.rio@gmail.com',
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
]
