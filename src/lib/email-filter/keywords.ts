// Phrases de prospection FORTES — pitch sales / B2B non-ambigu.
// Règle : 1 STRONG seul → REJECT 'prospection'. Avec event keyword → LLM (filet).
export const PROSPECTION_PHRASES_STRONG = [
  // pitches sales explicites
  "notre solution permet",
  "augmenter votre chiffre d'affaires",
  "augmenter votre ca",
  "proposition de partenariat",
  "referencement de votre etablissement",
  "nous accompagnons les restaurants",
  "15 minutes de votre temps",
  "quelques minutes de votre temps",
  "demo de notre outil",
  "demo de notre solution",
  "optimiser votre gestion",
  "solution dediee aux restaurants",
  "booster vos ventes",
  "developper votre visibilite",
  "nous proposons aux restaurateurs",
  // démarchage commercial (règle 4)
  "a l'attention du responsable commercial",
  "valoriser vos espaces",
  // invitations B2B / événements tiers (règle 5)
  "vous etes invite a participer",
  "vous invite a participer",
  "job dating",
]

// Phrases de prospection FAIBLES — formules polies utilisables aussi par
// de vrais clients. Règle : 1 WEAK seul → continue scoring (souvent LLM).
// 2+ WEAK seuls → LLM softReject. WEAK + event keyword → continue (event wins).
export const PROSPECTION_PHRASES_WEAK = [
  "je me permets de vous contacter",
  "je me permets de revenir vers vous",
  "rendez-vous telephonique",
  "je reviens vers vous suite a mon precedent",
]

export const EVENT_KEYWORDS = {
  strong: [
    'privatisation', 'privatiser', 'privatif', 'privatisez',
    'mariage', 'nous marions', 'se marier',
    'bapteme', 'baptiser',
    'evjf', 'evg', 'enterrement de vie',
    "comite d'entreprise", 'comite dentreprise',
    'cse',
    'seminaire', 'team building', 'teambuilding',
    'cocktail dinatoire',
    'buffet privatise',
    'reception privee',
    'soiree privee',
    'devis groupe', 'tarif groupe', 'tarifs groupe',
    'rotary', 'lions club', 'kiwanis',
  ],
  medium: [
    'evenement',
    'anniversaire', 'feter',
    'organiser', 'reserver',
    'groupe de', 'pour nous', 'pour notre',
    "repas d'entreprise", 'repas dentreprise',
    "repas d'affaires",
    "diner d'entreprise", 'diner dentreprise',
    'association', 'reunion',
  ],
}
