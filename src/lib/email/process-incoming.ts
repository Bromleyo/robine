import { prisma } from '@/lib/db/prisma'
import { filterEmail, type RejectReason } from '@/lib/email-filter'
import { extractDemandeFromEmail } from '@/lib/llm/extract-email'
import { detecterConflits } from '@/lib/business/conflit'
import { calculerUrgenceDemande } from '@/lib/business/urgence'
import { nextReferenceSeq } from '@/lib/db/demandes'
import { notifyRestaurant } from '@/lib/db/notifications'
import { logger } from '@/lib/logger'
import type { TypeEvenement } from '@prisma/client'
import type { NormalizedEmail } from './types'

export interface MailboxRef {
  id: string
  email: string
  restaurantId: string
}

const VALID_EVENT_TYPES = [
  'MARIAGE', 'DINER_ENTREPRISE', 'ANNIVERSAIRE', 'SEMINAIRE',
  'PRIVATISATION', 'BAPTEME', 'COCKTAIL', 'AUTRE',
] as const
type ValidEventType = typeof VALID_EVENT_TYPES[number]

export async function processIncomingEmail(email: NormalizedEmail, mailbox: MailboxRef): Promise<void> {
  const { restaurantId } = mailbox

  if (email.from.address.toLowerCase() === mailbox.email.toLowerCase()) return

  const exists = await prisma.message.findFirst({
    where: { microsoftGraphId: email.providerMessageId },
    select: { id: true },
  })
  if (exists) return

  const filterResult = filterEmail(email, mailbox.email)

  if (filterResult.decision.action === 'reject') {
    await logRejectedEmail({
      restaurantId,
      mailboxId: mailbox.id,
      microsoftGraphId: email.providerMessageId,
      fromEmail: email.from.address,
      fromName: email.from.name,
      subject: email.subject,
      rejectReason: filterResult.decision.rejectReason,
      details: filterResult.decision.details ?? null,
      bodySnippet: email.bodyText.slice(0, 400),
      receivedAt: email.receivedAt,
    })
    logger.info({ fromEmail: email.from.address, reason: filterResult.decision.rejectReason }, 'email rejected by pre-filter')
    return
  }

  const existingThread = email.conversationId
    ? await prisma.thread.findFirst({
        where: { graphConversationId: email.conversationId, demande: { restaurantId } },
        select: { id: true, demandeId: true },
      })
    : null

  if (existingThread) {
    await storeMessage(existingThread.id, email)
    await prisma.demande.update({
      where: { id: existingThread.demandeId },
      data: { lastMessageAt: email.receivedAt, lastMessageDirection: 'IN' },
    })
    void notifyRestaurant({
      restaurantId,
      type: 'NOUVEAU_MESSAGE',
      titre: `Nouveau message — ${email.from.name ?? email.from.address}`,
      body: email.subject ?? undefined,
      demandeId: existingThread.demandeId,
    })
    return
  }

  if (filterResult.decision.action === 'send_to_llm' && filterResult.decision.softRejectReason) {
    logger.info({ fromEmail: email.from.address, softRejectReason: filterResult.decision.softRejectReason }, 'email soft-reject: sending to LLM for final decision')
  }

  if (filterResult.decision.action === 'accept_direct') {
    logger.info({ fromEmail: email.from.address, keywords: filterResult.decision.matchedKeywords }, 'email accepted by rules, skipping LLM')
    await createAndPersistDemande(email, mailbox, {
      typeEvenement: filterResult.extractedBasic?.typeEvenement ?? null,
      dateEvenement: filterResult.extractedBasic?.dateEvenement ?? null,
      nbInvites: filterResult.extractedBasic?.nbInvites ?? null,
      heureDebut: null, heureFin: null, budgetIndicatifCents: null,
      contraintesAlimentaires: [], notes: null,
      nomContact: null, societeContact: null, telephoneContact: null,
      classificationMethod: 'rules_hard_positive',
    })
    return
  }

  const extraction = await extractDemandeFromEmail(email.bodyText, email.from.address)
  if (!extraction.isDemandeEvenement) {
    if (filterResult.decision.action === 'send_to_llm' && filterResult.decision.softRejectReason) {
      await logRejectedEmail({
        restaurantId,
        mailboxId: mailbox.id,
        microsoftGraphId: email.providerMessageId,
        fromEmail: email.from.address,
        fromName: email.from.name,
        subject: email.subject,
        rejectReason: 'prospection',
        details: `soft_reject_confirmed_by_llm: ${filterResult.decision.softRejectReason}`,
        bodySnippet: email.bodyText.slice(0, 400),
        receivedAt: email.receivedAt,
      })
    }
    logger.info({ fromEmail: email.from.address }, 'not an event request, skipping')
    return
  }

  const typeEvenement = VALID_EVENT_TYPES.includes(extraction.typeEvenement as ValidEventType)
    ? (extraction.typeEvenement as ValidEventType)
    : null

  await createAndPersistDemande(email, mailbox, {
    typeEvenement,
    dateEvenement: extraction.dateEvenement ? new Date(extraction.dateEvenement) : null,
    nbInvites: extraction.nbInvites,
    heureDebut: extraction.heureDebut,
    heureFin: extraction.heureFin,
    budgetIndicatifCents: extraction.budgetIndicatifCents,
    contraintesAlimentaires: extraction.contraintesAlimentaires,
    notes: extraction.notes,
    nomContact: extraction.nomContact,
    societeContact: extraction.societeContact,
    telephoneContact: extraction.telephoneContact,
    classificationMethod: 'ai',
  })
}

interface DemandeFields {
  typeEvenement: TypeEvenement | null
  dateEvenement: Date | null
  nbInvites: number | null
  heureDebut: string | null
  heureFin: string | null
  budgetIndicatifCents: number | null
  contraintesAlimentaires: string[]
  notes: string | null
  nomContact: string | null
  societeContact: string | null
  telephoneContact: string | null
  classificationMethod: 'rules_hard_positive' | 'ai'
}

async function createAndPersistDemande(email: NormalizedEmail, mailbox: MailboxRef, fields: DemandeFields) {
  const { restaurantId } = mailbox
  const fromEmail = email.from.address

  const contact = await prisma.contact.upsert({
    where: { restaurantId_email: { restaurantId, email: fromEmail } },
    update: {
      nom: fields.nomContact ?? email.from.name ?? fromEmail,
      ...(fields.societeContact && { societe: fields.societeContact }),
      ...(fields.telephoneContact && { telephone: fields.telephoneContact }),
    },
    create: {
      restaurantId,
      email: fromEmail,
      nom: fields.nomContact ?? email.from.name ?? fromEmail,
      societe: fields.societeContact,
      telephone: fields.telephoneContact,
    },
  })

  const reference = await nextReferenceSeq(restaurantId)
  const now = new Date()
  const urgence = calculerUrgenceDemande({
    statut: 'NOUVELLE',
    dateEvenement: fields.dateEvenement,
    now,
    lastMessageAt: email.receivedAt,
    lastMessageDirection: 'IN',
  })

  const demande = await prisma.demande.create({
    data: {
      restaurantId,
      reference,
      contactId: contact.id,
      statut: 'NOUVELLE',
      typeEvenement: fields.typeEvenement ?? undefined,
      origine: 'EMAIL',
      dateEvenement: fields.dateEvenement,
      heureDebut: fields.heureDebut,
      heureFin: fields.heureFin,
      nbInvites: fields.nbInvites,
      budgetIndicatifCents: fields.budgetIndicatifCents,
      contraintesAlimentaires: fields.contraintesAlimentaires,
      notes: fields.notes,
      classificationMethod: fields.classificationMethod,
      urgenceScore: urgence.score,
      lastMessageAt: email.receivedAt,
      lastMessageDirection: 'IN',
    },
  })

  await prisma.contact.update({
    where: { id: contact.id },
    data: { nbDemandesTotal: { increment: 1 } },
  })

  const thread = await prisma.thread.create({
    data: {
      demandeId: demande.id,
      subject: email.subject ?? '(sans objet)',
      messageIdRoot: email.internetMessageId,
      graphConversationId: email.conversationId,
      references: email.references,
    },
  })

  await storeMessage(thread.id, email)

  const { hasConflict } = await detecterConflits(restaurantId, demande.id)
  if (hasConflict) {
    await prisma.demande.update({ where: { id: demande.id }, data: { conflitDetecte: true } })
  }

  void notifyRestaurant({
    restaurantId,
    type: 'NOUVELLE_DEMANDE',
    titre: `Nouvelle demande — ${reference}`,
    body: `${contact.nom} · ${email.subject ?? ''}`.trim(),
    demandeId: demande.id,
  })
}

async function storeMessage(threadId: string, email: NormalizedEmail) {
  await prisma.message.create({
    data: {
      threadId,
      microsoftGraphId: email.providerMessageId,
      messageIdHeader: email.internetMessageId,
      inReplyTo: email.inReplyTo,
      references: email.references,
      direction: 'IN',
      fromEmail: email.from.address,
      fromName: email.from.name,
      toEmails: email.toRecipients,
      ccEmails: email.ccRecipients,
      subject: email.subject,
      bodyHtml: email.bodyHtml ?? '',
      bodyText: email.bodyText,
      receivedAt: email.receivedAt,
    },
  })
}

async function logRejectedEmail(data: {
  restaurantId: string
  mailboxId: string
  microsoftGraphId: string
  fromEmail: string
  fromName: string | null
  subject: string | null
  rejectReason: RejectReason
  details: string | null
  bodySnippet: string
  receivedAt: Date
}) {
  await prisma.rejectedEmail.create({ data }).catch(err => {
    logger.error({ err, microsoftGraphId: data.microsoftGraphId }, 'failed to log rejected email')
  })
}
