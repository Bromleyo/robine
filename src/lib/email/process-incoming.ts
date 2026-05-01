import { prisma } from '@/lib/db/prisma'
import { filterEmail, type RejectReason, type ExtraBlacklist } from '@/lib/email-filter'
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

  const extraBlacklist = await loadRestaurantBlacklist(restaurantId)
  const filterResult = filterEmail(email, mailbox.email, { extraBlacklist })

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

  let existingThread: { id: string; demandeId: string } | null = null

  if (email.conversationId) {
    existingThread = await prisma.thread.findFirst({
      where: { graphConversationId: email.conversationId, demande: { restaurantId } },
      select: { id: true, demandeId: true },
    })
  }

  if (!existingThread && email.inReplyTo) {
    const parent = await prisma.message.findFirst({
      where: { messageIdHeader: email.inReplyTo, thread: { demande: { restaurantId } } },
      select: { threadId: true, thread: { select: { demandeId: true } } },
    })
    if (parent) existingThread = { id: parent.threadId, demandeId: parent.thread.demandeId }
  }

  if (!existingThread && email.references.length > 0) {
    const ancestor = await prisma.message.findFirst({
      where: { messageIdHeader: { in: email.references }, thread: { demande: { restaurantId } } },
      select: { threadId: true, thread: { select: { demandeId: true } } },
    })
    if (ancestor) existingThread = { id: ancestor.threadId, demandeId: ancestor.thread.demandeId }
  }

  if (existingThread) {
    await storeMessage(existingThread.id, email)

    // PR2 — R3+R4 : un IN rattaché à une demande existante en ATTENTE_CLIENT
    // ou CONFIRMEE ré-ouvre la conversation. Note : R4 n'inverse PAS les
    // compteurs contact (nbDemandesConfirmees, caTotalEstimeCents) car le
    // bascule peut être temporaire (le client peut juste demander une précision).
    // Les compteurs ne bougent que via le PATCH manuel (status-selector).
    const current = await prisma.demande.findUnique({
      where: { id: existingThread.demandeId },
      select: { statut: true },
    })
    const previousStatut = current?.statut ?? null
    const shouldReopen = previousStatut === 'ATTENTE_CLIENT' || previousStatut === 'CONFIRMEE'

    await prisma.demande.update({
      where: { id: existingThread.demandeId },
      data: {
        lastMessageAt: email.receivedAt,
        lastMessageDirection: 'IN',
        ...(shouldReopen ? { statut: 'EN_COURS' as const } : {}),
      },
    })

    if (shouldReopen && previousStatut) {
      logger.info({
        demandeId: existingThread.demandeId,
        from: previousStatut,
        to: 'EN_COURS',
        reason: 'in_received_on_closed_status',
        transition: previousStatut === 'CONFIRMEE' ? 'R4' : 'R3',
        contactStatsPreserved: previousStatut === 'CONFIRMEE',
      }, '[demande] auto status transition')
    }

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
    const softReject = filterResult.decision.action === 'send_to_llm'
      ? filterResult.decision.softRejectReason
      : undefined
    await logRejectedEmail({
      restaurantId,
      mailboxId: mailbox.id,
      microsoftGraphId: email.providerMessageId,
      fromEmail: email.from.address,
      fromName: email.from.name,
      subject: email.subject,
      rejectReason: softReject ? 'prospection' : 'llm_reject',
      details: softReject ? `soft_reject_confirmed_by_llm: ${softReject}` : null,
      bodySnippet: email.bodyText.slice(0, 400),
      receivedAt: email.receivedAt,
    })
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

async function loadRestaurantBlacklist(restaurantId: string): Promise<ExtraBlacklist> {
  try {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { blacklistAdditions: true },
    })
    const raw = r?.blacklistAdditions as { senders?: unknown; domains?: unknown } | null
    if (!raw || typeof raw !== 'object') return { senders: [], domains: [] }
    const senders = Array.isArray(raw.senders) ? raw.senders.filter((s): s is string => typeof s === 'string') : []
    const domains = Array.isArray(raw.domains) ? raw.domains.filter((s): s is string => typeof s === 'string') : []
    return { senders, domains }
  } catch (err) {
    logger.warn({ err, restaurantId }, 'failed to load restaurant blacklist, defaulting to empty')
    return { senders: [], domains: [] }
  }
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
