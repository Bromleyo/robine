import Anthropic from '@anthropic-ai/sdk'
import { EmailExtractionSchema } from '@/lib/validation/schemas'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface EmailExtraction {
  isDemandeEvenement: boolean
  nomContact: string | null
  emailContact: string
  societeContact: string | null
  telephoneContact: string | null
  typeEvenement: string | null
  dateEvenement: string | null
  heureDebut: string | null
  heureFin: string | null
  nbInvites: number | null
  budgetIndicatifCents: number | null
  contraintesAlimentaires: string[]
  notes: string | null
  confidence: 'high' | 'medium' | 'low'
}

const FALLBACK_NON_DEMANDE = (senderEmail: string): EmailExtraction => ({
  isDemandeEvenement: false, nomContact: null, emailContact: senderEmail,
  societeContact: null, telephoneContact: null, typeEvenement: null,
  dateEvenement: null, heureDebut: null, heureFin: null,
  nbInvites: null, budgetIndicatifCents: null, contraintesAlimentaires: [],
  notes: null, confidence: 'low',
})

const FALLBACK_PARSE_ERROR = (senderEmail: string): EmailExtraction => ({
  isDemandeEvenement: false, nomContact: null, emailContact: senderEmail,
  societeContact: null, telephoneContact: null, typeEvenement: null,
  dateEvenement: null, heureDebut: null, heureFin: null,
  nbInvites: null, budgetIndicatifCents: null, contraintesAlimentaires: [],
  notes: null, confidence: 'low',
})

const SYSTEM_PROMPT = `Tu es un assistant qui filtre les emails reçus par un restaurant gastronomique.

## Règle principale
Un email EST une demande d'événement UNIQUEMENT si une personne cherche à organiser un événement dans le restaurant et demande un devis, une disponibilité ou une réservation de groupe/privatisation.

## Exemples ACCEPTÉS (isDemandeEvenement: true)
- Demande de devis pour un mariage, anniversaire, baptême, PACS, bar/bat-mitsvah
- Demande de privatisation (salle, terrasse, restaurant entier)
- Repas de groupe entreprise : dîner d'équipe, séminaire, déjeuner d'affaires, comité d'entreprise, team building, pot de départ, incentive
- Demande de réservation pour un groupe (en général 8 personnes ou plus)
- Question sur les menus avec mention d'un événement ou d'un groupe
- Demande de cocktail dînatoire, vin d'honneur, afterwork privatisé

## Exemples REJETÉS (isDemandeEvenement: false)
- Newsletters, emails marketing, promotions
- Emails de fournisseurs, livreurs, prestataires
- Confirmations automatiques, accusés de réception, notifications de système
- Spam, phishing, prospection commerciale
- Factures, bons de commande, devis fournisseurs
- Avis clients (Google, TripAdvisor), réponses à des avis
- Emails internes, notifications RH, paie
- Réservations individuelles (1 à 2 personnes) sans mention d'événement
- Questions générales sur les horaires, le menu du jour, les tarifs sans intention d'événement
- Rappels de rendez-vous, confirmations de réservation déjà enregistrées
- Emails de plateformes (TheFork/LaFourchette, OpenTable) sauf si c'est une demande de groupe
- Relances de prospects non pertinents (agences, commerciaux, partenaires)

## En cas de doute
Si l'intention d'organiser un événement collectif dans le restaurant n'est pas claire, réponds false.

## Format de réponse
Si rejeté : {"isDemandeEvenement": false}
Si accepté : isDemandeEvenement: true + les champs ci-dessous. Extrais UNIQUEMENT ce qui est explicitement écrit, ne devine pas.

Pour typeEvenement : MARIAGE, DINER_ENTREPRISE, ANNIVERSAIRE, SEMINAIRE, PRIVATISATION, BAPTEME, COCKTAIL, AUTRE.
Pour dateEvenement : format ISO YYYY-MM-DD. Si l'année manque, prends la prochaine occurrence logique.
Pour budgetIndicatifCents : convertis en centimes (3000€ → 300000).
Pour contraintesAlimentaires : liste les régimes/allergies (vegetarien, vegan, kasher, halal, sans_gluten, etc.).
Pour confidence : high si date + type + nbInvites tous présents, medium si 2 des 3, low sinon.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour.`

export async function extractDemandeFromEmail(
  emailText: string,
  senderEmail: string,
): Promise<EmailExtraction> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Email de: ${senderEmail}\n\n<email_content>\n${emailText.slice(0, 4000)}\n</email_content>` }],
  })

  const first = message.content[0]
  const text = first?.type === 'text' ? first.text : ''

  try {
    const json = JSON.parse(text)
    const result = EmailExtractionSchema.safeParse(json)
    if (!result.success) {
      console.error('[extract-email] Schema validation failed:', result.error.flatten())
      return FALLBACK_PARSE_ERROR(senderEmail)
    }
    const data = result.data
    if (data.isDemandeEvenement === false) return FALLBACK_NON_DEMANDE(senderEmail)
    return {
      isDemandeEvenement: true,
      nomContact: data.nomContact ?? null,
      emailContact: data.emailContact ?? senderEmail,
      societeContact: data.societeContact ?? null,
      telephoneContact: data.telephoneContact ?? null,
      typeEvenement: data.typeEvenement ?? null,
      dateEvenement: data.dateEvenement ?? null,
      heureDebut: data.heureDebut ?? null,
      heureFin: data.heureFin ?? null,
      nbInvites: data.nbInvites ?? null,
      budgetIndicatifCents: data.budgetIndicatifCents ?? null,
      contraintesAlimentaires: data.contraintesAlimentaires ?? [],
      notes: data.notes ?? null,
      confidence: data.confidence ?? 'low',
    }
  } catch {
    return FALLBACK_PARSE_ERROR(senderEmail)
  }
}
