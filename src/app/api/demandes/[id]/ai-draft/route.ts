import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise", ANNIVERSAIRE: 'Anniversaire',
  SEMINAIRE: 'Séminaire', PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { instruction?: string; previousDraft?: string }

  const demande = await prisma.demande.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
    include: {
      contact: true,
      espace: { select: { nom: true } },
      threads: {
        orderBy: { createdAt: 'asc' },
        include: {
          messages: { orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }] },
        },
      },
    },
  })

  if (!demande) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [regleIA, aiPersonalization, activeMenus] = await Promise.all([
    prisma.regleIA.findUnique({ where: { restaurantId: session.user.restaurantId }, select: { id: true } }),
    prisma.aIPersonalization.findUnique({ where: { restaurantId: session.user.restaurantId }, select: { rulesMarkdown: true } }),
    prisma.menu.findMany({
      where: { restaurantId: session.user.restaurantId, actif: true },
      select: { id: true, nom: true, pdfUrl: true, choixUniqueDispo: true, choixUniqueMinPax: true, choixMultipleDispo: true, choixMultipleMinPax: true },
    }),
  ])

  const restaurantId = session.user.restaurantId
  const aiConfig = await prisma.aIConfiguration.findUnique({
    where: { restaurantId },
    select: { compiledPrompt: true },
  })
  const compiledPrompt = aiConfig?.compiledPrompt ?? null

  const allMessages = demande.threads.flatMap(t => t.messages)

  const details: string[] = []
  if (demande.typeEvenement) details.push(`Type : ${EVENT_LABEL[demande.typeEvenement] ?? demande.typeEvenement}`)
  if (demande.dateEvenement) details.push(`Date : ${new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(demande.dateEvenement)}`)
  if (demande.heureDebut) details.push(`Horaire : ${demande.heureDebut}${demande.heureFin ? ` – ${demande.heureFin}` : ''}`)
  if (demande.nbInvites) details.push(`Invités : ${demande.nbInvites} personnes`)
  if (demande.budgetIndicatifCents) details.push(`Budget : ~${Math.round(demande.budgetIndicatifCents / 100)} € / pers.`)
  if (demande.espace) details.push(`Espace : ${demande.espace.nom}`)
  if (demande.contraintesAlimentaires.length > 0) details.push(`Contraintes : ${demande.contraintesAlimentaires.join(', ')}`)

  const contextParts: string[] = []
  if (details.length > 0) contextParts.push(`INFORMATIONS DE LA DEMANDE :\n${details.join('\n')}`)

  if (allMessages.length > 0) {
    const history = allMessages.map(m => {
      const who = m.direction === 'IN' ? `CLIENT (${demande.contact.nom})` : 'NOUS'
      const text = (m.bodyText ?? m.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim().slice(0, 800)
      return `[${who}]\n${text}`
    }).join('\n\n---\n\n')
    contextParts.push(`HISTORIQUE :\n${history}`)
  }

  let systemPrompt: string
  if (compiledPrompt) {
    systemPrompt = compiledPrompt
  } else if (regleIA) {
    systemPrompt = `Tu es l'assistant du responsable événementiel d'un restaurant gastronomique.
Rédige une réponse email professionnelle, chaleureuse et concise en français, au nom du restaurant.
Style : poli, élégant. Utilise "Madame" ou "Monsieur" si le prénom permet de déduire le genre, sinon "Madame, Monsieur".
Signe toujours : "Bien cordialement,\n[L'équipe événementielle]"
Réponds UNIQUEMENT avec le corps du mail, sans objet ni balises HTML.${aiPersonalization?.rulesMarkdown ? `\n\n---\n\nRÈGLES PERSONNALISÉES DU RESTAURANT (à appliquer impérativement) :\n${aiPersonalization.rulesMarkdown}` : ''}`
  } else {
    systemPrompt = `Tu es un assistant pour un restaurant qui répond aux demandes événementielles. Sois professionnel et chaleureux.`
  }

  let userContent: string
  if (body.previousDraft && body.instruction) {
    userContent = `Contexte :\n\n${contextParts.join('\n\n===\n\n')}\n\n---\n\nBrouillon précédent :\n${body.previousDraft}\n\n---\n\nInstruction de modification : ${body.instruction}\n\nReprends le brouillon et applique cette modification.`
  } else {
    userContent = `${contextParts.join('\n\n===\n\n')}\n\n---\n\nRédige une réponse appropriée au dernier message du client.`
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const first = message.content[0]
  const draft = first?.type === 'text' ? first.text.trim() : ''

  const nbInvites = demande.nbInvites
  const attachmentSuggestions = activeMenus
    .filter(m => {
      if (!m.pdfUrl) return false
      if (!nbInvites) return true
      const seuilMin = Math.min(
        m.choixUniqueDispo ? (m.choixUniqueMinPax ?? 0) : Infinity,
        m.choixMultipleDispo ? (m.choixMultipleMinPax ?? 0) : Infinity,
      )
      return seuilMin === 0 || nbInvites >= seuilMin
    })
    .map(m => ({ name: `${m.nom}.pdf`, url: m.pdfUrl as string }))

  return NextResponse.json({ draft, attachmentSuggestions })
}
