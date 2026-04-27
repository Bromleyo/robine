import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'
import { getAppGraphToken } from '@/lib/graph/auth'
import { htmlToText } from '@/lib/email/html-to-text'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

const GRAPH_BATCH_URL = 'https://graph.microsoft.com/v1.0/$batch'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface MsgFull {
  id: string
  from: { emailAddress: { address: string; name: string } }
  body: { contentType: 'html' | 'text'; content: string }
  receivedDateTime: string
}

interface BatchResponse {
  responses: {
    id: string
    status: number
    body: { value?: MsgFull[] }
  }[]
}

async function batchFetchConversations(
  mailboxEmail: string,
  conversationIds: string[],
  token: string,
): Promise<Map<string, MsgFull[]>> {
  const result = new Map<string, MsgFull[]>()
  const BATCH_SIZE = 20
  const encodedEmail = encodeURIComponent(mailboxEmail)

  for (let i = 0; i < conversationIds.length; i += BATCH_SIZE) {
    const chunk = conversationIds.slice(i, i + BATCH_SIZE)
    const requests = chunk.map((cid, idx) => ({
      id: String(idx),
      method: 'GET',
      url: `/users/${encodedEmail}/messages?$filter=conversationId eq '${cid}'&$select=id,from,body,receivedDateTime&$top=50`,
    }))

    const batchRes = await fetch(GRAPH_BATCH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })

    if (!batchRes.ok) {
      console.error('[ai-personalization/configure] Batch request failed', batchRes.status)
      continue
    }

    const batchData = await batchRes.json() as BatchResponse
    for (const resp of batchData.responses ?? []) {
      if (resp.status === 200 && resp.body?.value) {
        const cid = chunk[parseInt(resp.id)]
        if (cid) {
          const sorted = [...resp.body.value].sort(
            (a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime(),
          )
          result.set(cid, sorted)
        }
      }
    }
  }

  return result
}

function formatThread(idx: number, total: number, messages: MsgFull[], mailboxEmail: string): string {
  const lines: string[] = [`=== Thread ${idx + 1}/${total} ===`]
  for (const msg of messages) {
    const date = new Date(msg.receivedDateTime).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    })
    const fromAddr = msg.from.emailAddress.address
    const fromName = msg.from.emailAddress.name || fromAddr
    const role = fromAddr.toLowerCase() === mailboxEmail.toLowerCase() ? 'RESTAURANT' : 'CLIENT'
    const bodyText = msg.body.contentType === 'html' ? htmlToText(msg.body.content) : msg.body.content
    lines.push(`[${date}] ${role} (${fromName} <${fromAddr}>) :\n${bodyText.slice(0, 2000)}`)
  }
  return lines.join('\n\n')
}

const SYSTEM_PROMPT = `Tu es un expert en analyse conversationnelle, spécialisé dans le secteur de la restauration événementielle. Tu vas analyser un corpus de vrais échanges email entre un restaurant et ses clients qui font des demandes d'événements (privatisations, mariages, séminaires, anniversaires, etc.).

Ton objectif : produire un document de RÈGLES écrites en français qui, injecté dans le prompt système d'une autre IA, lui permettra de répondre aux nouvelles demandes EXACTEMENT comme le restaurant le ferait — même ton, même structure, mêmes formules, même processus de qualification.

Le document doit être:
- Concret et actionnable (pas de généralités)
- Riche en exemples textuels précis (formules récurrentes, expressions typiques, mots-clés du restaurant)
- Structuré en sections claires
- Rédigé pour qu'un autre Claude puisse l'appliquer directement`

function buildUserPrompt(corpus: string, threadCount: number, partial?: string): string {
  const partialNote = partial ? `\n\nNote: ceci est une analyse partielle (${partial}).` : ''
  return `Voici ${threadCount} threads de conversations entre un restaurant français et ses clients sur des demandes d'événements.

${corpus}

Analyse ce corpus et produis un document Markdown structuré avec les sections suivantes :

## 1. Ton et registre
Comment le restaurant s'adresse-t-il aux clients ? Tutoiement/vouvoiement ? Niveau de formalité ? Chaleur, distance, etc. Donne 3-5 exemples textuels précis tirés du corpus.

## 2. Structure type d'une réponse à une nouvelle demande
Quel est le squelette type d'une première réponse ? (accroche → remerciement → questions de qualification → présentation des options → appel à l'action). Décris-le précisément.

## 3. Questions de qualification systématiques
Quelles sont les informations que le restaurant cherche TOUJOURS à obtenir avant de proposer un devis ? (date, nombre de convives, type d'événement, budget, contraintes alimentaires, etc.) Liste-les par ordre de priorité.

## 4. Formules récurrentes
Liste les phrases types réutilisées (ouverture, transition, conclusion, remerciement). Cite-les telles qu'écrites dans le corpus.

## 5. Gestion des prix et devis
Comment le restaurant aborde-t-il les prix ? Communique-t-il un budget indicatif d'emblée ? Renvoie-t-il vers un menu PDF ? Propose-t-il plusieurs formules ? Comment justifie-t-il les tarifs ?

## 6. Gestion des objections et négociations
Comment réagit le restaurant face à : un client qui trouve cher, qui demande une remise, qui hésite, qui demande des modifs au menu, qui a une contrainte forte (allergie, religion, budget) ?

## 7. Espaces et capacités
Quelles informations le restaurant donne-t-il sur ses espaces (La Cave, Le Salon, etc.) ? Comment les présente-t-il ? Quelles capacités sont mentionnées ?

## 8. Suivi et relances
Comment et quand le restaurant relance-t-il un client qui ne répond pas ? Quelles formules utilise-t-il ?

## 9. Particularités et signaux culturels
Tout ce qui rend le style unique au restaurant et qui doit être préservé : expressions régionales, références au lieu, personnalisation, humour, ouverture à la flexibilité, etc.

## 10. Anti-patterns à éviter
Y a-t-il des choses que le restaurant ne fait JAMAIS dans ses réponses ? (ex: ne jamais commencer par "Bonjour", toujours signer du prénom, ne jamais donner un prix par téléphone, etc.)

Sois exhaustif et factuel. Cite des extraits réels du corpus pour illustrer chaque règle. Le document doit faire entre 1500 et 4000 mots.${partialNote}`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const body = await req.json() as { mailboxId?: string; conversationIds?: string[]; keywords?: string[] }
  if (!body.mailboxId || !Array.isArray(body.conversationIds) || body.conversationIds.length === 0) {
    return NextResponse.json({ error: 'mailboxId et conversationIds requis' }, { status: 400 })
  }

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { id: body.mailboxId, restaurantId: session.user.restaurantId },
    select: { id: true, email: true, displayName: true },
  })
  if (!mailbox) {
    return NextResponse.json({ error: 'Mailbox introuvable' }, { status: 404 })
  }

  const token = await getAppGraphToken()
  const keywords = Array.isArray(body.keywords) && body.keywords.length > 0 ? body.keywords : []
  const convMap = await batchFetchConversations(mailbox.email, body.conversationIds, token)

  const threadTexts: string[] = []
  let convIdx = 0
  for (const cid of body.conversationIds) {
    const messages = convMap.get(cid) ?? []
    if (messages.length === 0) continue
    threadTexts.push(formatThread(convIdx, body.conversationIds.length, messages, mailbox.email))
    convIdx++
  }

  const SEP = '\n\n' + '='.repeat(60) + '\n\n'
  const corpus = threadTexts.join(SEP)
  const threadsAnalyzed = threadTexts.length

  const estimatedTokens = Math.ceil(corpus.length / 4)
  const TOKEN_SPLIT_THRESHOLD = 800_000

  let markdown: string
  let totalInputTokens = 0
  let totalOutputTokens = 0

  if (estimatedTokens > TOKEN_SPLIT_THRESHOLD) {
    console.warn(`[configure] Large corpus ~${estimatedTokens} tokens — splitting`)
    const half = Math.floor(threadTexts.length / 2)

    const [res1, res2] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 4000, temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(threadTexts.slice(0, half).join(SEP), half, 'batch 1/2') }],
      }),
      anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 4000, temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(threadTexts.slice(half).join(SEP), threadTexts.length - half, 'batch 2/2') }],
      }),
    ])

    totalInputTokens = res1.usage.input_tokens + res2.usage.input_tokens
    totalOutputTokens = res1.usage.output_tokens + res2.usage.output_tokens
    const draft1 = res1.content[0]?.type === 'text' ? res1.content[0].text : ''
    const draft2 = res2.content[0]?.type === 'text' ? res2.content[0].text : ''

    const mergeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 8000, temperature: 0.3,
      system: 'Tu es un expert en analyse de communications restaurant. Fusionne les deux analyses partielles en un document Markdown cohérent.',
      messages: [{ role: 'user', content: `Fusionne en un document Markdown unifié (10 sections).\n\n--- ANALYSE 1 ---\n${draft1}\n\n--- ANALYSE 2 ---\n${draft2}` }],
    })
    totalInputTokens += mergeRes.usage.input_tokens
    totalOutputTokens += mergeRes.usage.output_tokens
    markdown = mergeRes.content[0]?.type === 'text' ? mergeRes.content[0].text : draft1

  } else {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 8000, temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(corpus, threadsAnalyzed) }],
    })
    totalInputTokens = res.usage.input_tokens
    totalOutputTokens = res.usage.output_tokens
    markdown = res.content[0]?.type === 'text' ? res.content[0].text : ''
  }

  const record = await prisma.aIPersonalization.upsert({
    where: { restaurantId: session.user.restaurantId },
    create: { restaurantId: session.user.restaurantId, mailboxId: mailbox.id, threadsAnalyzed, rulesMarkdown: markdown, keywords },
    update: { mailboxId: mailbox.id, threadsAnalyzed, rulesMarkdown: markdown, keywords },
  })

  return NextResponse.json({
    personalization: {
      id: record.id,
      mailboxId: record.mailboxId,
      mailboxEmail: mailbox.email,
      mailboxDisplayName: mailbox.displayName,
      threadsAnalyzed: record.threadsAnalyzed,
      rulesMarkdown: record.rulesMarkdown,
      keywords: record.keywords,
      createdAt: record.createdAt.toISOString(),
    },
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
  })
}
