import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const restaurantId = session.user.restaurantId

  const [demande, regleRow] = await Promise.all([
    prisma.demande.findFirst({
      where: { id, restaurantId },
      include: {
        contact: { select: { nom: true, email: true, societe: true } },
        espace: { select: { nom: true, capaciteMax: true } },
        menu: { select: { nom: true, prixCents: true } },
      },
    }),
    prisma.regleIA.findUnique({ where: { restaurantId }, select: { config: true } }),
  ])

  if (!demande) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = (regleRow?.config ?? {}) as Record<string, unknown>
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: buildSystemPrompt(config),
    messages: [{ role: 'user', content: buildUserPrompt(demande) }],
  })

  const first = message.content[0]
  const raw = first?.type === 'text' ? first.text : ''
  return NextResponse.json(parseResponse(raw))
}

function buildSystemPrompt(config: Record<string, unknown>): string {
  const menus = Array.isArray(config.menus) ? config.menus : []
  const supplements = (config.supplements ?? {}) as Record<string, unknown>
  const acompte = (config.acompte ?? { actif: false, pourcentage: 30 }) as Record<string, unknown>
  const conditionsAnnulation = typeof config.conditionsAnnulation === 'string' ? config.conditionsAnnulation : ''
  const seuilsCA = (config.seuilsCA ?? {}) as Record<string, unknown>

  return `Tu es l'assistant commercial du restaurant Le Robin. Tu rédiges des réponses professionnelles aux demandes de privatisation et d'événements.

## RÈGLES MÉTIER

### Espaces & capacités
- Salle intérieure : 140 personnes max
- Chalet (petite salle) : 40 personnes max
- Terrasse extérieure : 90 personnes max

### Seuils CA minimum par salle et créneau
${JSON.stringify(seuilsCA, null, 2)}
Formule : Privatisation = max(0, Seuil_CA - (nb_personnes × prix_menu))

### Menus disponibles
${JSON.stringify(menus, null, 2)}
Règles : Menu D impossible en choix unique (min 60 pers., choix multiple obligatoire). Délais : 3 semaines à l'avance pour menus classiques, 10 jours pour Pierrade.

### Suppléments
- Vin supplémentaire : ${supplements.vinBouteilleCents ? Math.round(Number(supplements.vinBouteilleCents) / 100) + '€/bouteille' : '20€/bouteille'}
- Menu enfant : ${supplements.menuEnfantCents ? Math.round(Number(supplements.menuEnfantCents) / 100) + '€' : '15€'}
- Heures supplémentaires : ${supplements.heuresSuppCentsParH ? Math.round(Number(supplements.heuresSuppCentsParH) / 100) + '€/h' : '150€/h'} (vendredi/samedi soir à partir de 00h max 2h ; samedi/dimanche midi à partir de 15h30 max 17h)

### Inclus dans tous les menus
Apéritifs (punch maison ou kir), coca & jus, 1 bouteille de vin pour 4 personnes, eau, service.

### Acompte
${acompte.actif ? `Acompte demandé : ${acompte.pourcentage}% à la réservation.` : 'Aucun acompte demandé pour le moment.'}

### Conditions d'annulation
${conditionsAnnulation || 'À préciser selon nos conditions générales.'}

## FORMAT DE RÉPONSE OBLIGATOIRE
Réponds UNIQUEMENT avec ce JSON exact (aucun texte avant ou après) :
{"emailClient":"<email complet professionnel et chaleureux en français>","panneauAdmin":"<détail interne : CA prévisionnel, frais de privatisation, points bloquants, points à négocier>"}`
}

type DemandeWithRelations = {
  contact: { nom: string; email: string; societe?: string | null }
  espace: { nom: string; capaciteMax: number } | null
  menu: { nom: string; prixCents: number } | null
  typeEvenement: string | null
  dateEvenement: Date | null
  heureDebut: string | null
  heureFin: string | null
  nbInvites: number | null
  budgetIndicatifCents: number | null
  contraintesAlimentaires: string[]
  notes: string | null
}

function buildUserPrompt(demande: DemandeWithRelations): string {
  const lines = [
    `Client : ${demande.contact.nom}${demande.contact.societe ? ` (${demande.contact.societe})` : ''}`,
    `Email : ${demande.contact.email}`,
    `Type d'événement : ${demande.typeEvenement ?? 'Non précisé'}`,
    demande.dateEvenement ? `Date : ${new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(demande.dateEvenement))}` : null,
    (demande.heureDebut || demande.heureFin) ? `Horaire : ${[demande.heureDebut, demande.heureFin].filter(Boolean).join(' – ')}` : null,
    demande.nbInvites ? `Nombre d'invités : ${demande.nbInvites} personnes` : null,
    demande.espace ? `Espace souhaité : ${demande.espace.nom} (capacité max ${demande.espace.capaciteMax} pers.)` : null,
    demande.menu ? `Menu envisagé : ${demande.menu.nom} à ${Math.round(demande.menu.prixCents / 100)}€/pers.` : null,
    demande.budgetIndicatifCents ? `Budget indicatif : ~${Math.round(demande.budgetIndicatifCents / 100)}€/pers.` : null,
    demande.contraintesAlimentaires.length > 0 ? `Contraintes alimentaires : ${demande.contraintesAlimentaires.join(', ')}` : null,
    demande.notes ? `Notes : ${demande.notes}` : null,
  ].filter(Boolean)

  return `Demande à traiter :\n\n${lines.join('\n')}\n\nGénère l'email client et le panneau admin.`
}

function parseResponse(raw: string): { emailClient: string; panneauAdmin: string } {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>
      if (typeof parsed.emailClient === 'string' && typeof parsed.panneauAdmin === 'string') {
        return { emailClient: parsed.emailClient, panneauAdmin: parsed.panneauAdmin }
      }
    }
  } catch {
    // fall through to raw fallback
  }
  return { emailClient: raw, panneauAdmin: 'Réponse non structurée.' }
}
