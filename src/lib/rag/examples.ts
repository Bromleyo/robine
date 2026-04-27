import { prisma } from '@/lib/db/prisma'
import { TypeEvenement } from '@prisma/client'

const EVENT_LABEL: Record<TypeEvenement, string> = {
  MARIAGE: 'Mariage',
  DINER_ENTREPRISE: "Dîner d'entreprise",
  ANNIVERSAIRE: 'Anniversaire',
  SEMINAIRE: 'Séminaire',
  PRIVATISATION: 'Privatisation',
  BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail',
  AUTRE: 'Autre',
}

type ExampleRow = {
  subject: string
  typeEvenement: TypeEvenement | null
  startDate: Date
  messageCount: number
  messages: {
    direction: string
    fromName: string | null
    fromEmail: string
    bodyText: string
    sentAt: Date | null
  }[]
}

function formatExample(ex: ExampleRow): string {
  const header = [
    `Sujet : ${ex.subject}`,
    ex.typeEvenement ? `Type : ${EVENT_LABEL[ex.typeEvenement]}` : null,
    `Date : ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(ex.startDate)}`,
    `Messages : ${ex.messageCount}`,
  ]
    .filter(Boolean)
    .join('\n')

  const body = ex.messages
    .map((m) => {
      const who = m.direction === 'IN' ? `CLIENT (${m.fromName ?? m.fromEmail})` : 'NOUS'
      return `[${who}]\n${m.bodyText.trim().slice(0, 600)}`
    })
    .join('\n\n---\n\n')

  return `EXEMPLE DE CONVERSATION :\n${header}\n\n${body}`
}

export async function getRelevantExamples(
  restaurantId: string,
  typeEvenement: TypeEvenement | null | undefined,
  limit = 3,
): Promise<string[]> {
  const baseWhere = { restaurantId, status: 'APPROVED' }

  let examples = await prisma.conversationExample.findMany({
    where: { ...baseWhere, ...(typeEvenement ? { typeEvenement } : {}) },
    orderBy: { approvedAt: 'desc' },
    take: limit,
    include: { messages: { orderBy: { sentAt: 'asc' } } },
  })

  if (examples.length === 0 && typeEvenement) {
    examples = await prisma.conversationExample.findMany({
      where: baseWhere,
      orderBy: { approvedAt: 'desc' },
      take: limit,
      include: { messages: { orderBy: { sentAt: 'asc' } } },
    })
  }

  return examples.map(formatExample)
}
