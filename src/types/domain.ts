// Robin — core domain types

export type StatutDemande = 'NOUVELLE' | 'EN_COURS' | 'ATTENTE_CLIENT' | 'CONFIRMEE' | 'ANNULEE' | 'PERDUE'
export type TypeEvenement = 'MARIAGE' | 'DINER_ENTREPRISE' | 'ANNIVERSAIRE' | 'SEMINAIRE' | 'PRIVATISATION' | 'BAPTEME' | 'COCKTAIL' | 'AUTRE'
export type OrigineDemande = 'EMAIL' | 'FORMULAIRE' | 'TELEPHONE'
export type DirectionMessage = 'IN' | 'OUT'
export type RoleUtilisateur = 'ADMIN' | 'RESPONSABLE' | 'OBSERVATEUR'
export type ObjectifTemplate = 'PROPOSITION' | 'RELANCE' | 'DEVIS' | 'CONFIRMATION' | 'REFUS' | 'AUTRE'
export type NiveauUrgence = 'fresh' | 'warn' | 'hot'

export interface Restaurant {
  id: string
  slug: string
  nom: string
  adresse?: string
  timezone: string
  emailGroupes: string
}

export interface Contact {
  id: string
  restaurantId: string
  email: string
  nom: string
  societe?: string
  telephone?: string
  nbDemandesTotal: number
  nbDemandesConfirmees: number
}

export interface Espace {
  id: string
  restaurantId: string
  nom: string
  capaciteMax: number
  actif: boolean
}

export interface Demande {
  id: string
  restaurantId: string
  reference: string
  contactId: string
  assigneeId?: string
  espaceId?: string
  statut: StatutDemande
  typeEvenement?: TypeEvenement
  origine: OrigineDemande
  dateEvenement?: Date
  heureDebut?: string
  heureFin?: string
  nbInvites?: number
  budgetIndicatifCents?: number
  contraintesAlimentaires: string[]
  urgenceScore: number
  conflitDetecte: boolean
  lastMessageAt?: Date
  lastMessageDirection?: DirectionMessage
  // PR2 — null/absent = jamais consulté → hasUnread=true si dernier message IN.
  lastSeenByAssigneeAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface DemandeEnriched extends Demande {
  contact: Contact
  assignee?: { id: string; nom: string; avatarColor: string }
  espace?: Espace
  urgenceLevel: NiveauUrgence
  threadCount: number
  // PR2 — pastille "nouveau message". Calculé côté serveur via isUnread().
  hasUnread: boolean
}

export interface KanbanColonne {
  statut: StatutDemande
  label: string
  couleurDot: string
  demandes: DemandeEnriched[]
}

export interface Message {
  id: string
  threadId: string
  direction: DirectionMessage
  fromEmail: string
  fromName?: string
  bodyHtml: string
  isDraft: boolean
  wasGeneratedByAI: boolean
  sentAt?: Date
  receivedAt?: Date
}

export interface Thread {
  id: string
  demandeId: string
  subject: string
  messages: Message[]
}

export interface Menu {
  id: string
  restaurantId: string
  nom: string
  prixCents: number
  regimesSupportes: string[]
  actif: boolean
}

export interface TemplateMessage {
  id: string
  restaurantId: string
  nom: string
  objectif: ObjectifTemplate
  subjectTemplate: string
  bodyTemplate: string
  variables: string[]
}

// Résultat générique typé pour éviter les exceptions non gérées
export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E }
