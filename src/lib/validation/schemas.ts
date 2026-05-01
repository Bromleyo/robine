import { z } from 'zod'

export const StatutDemandeSchema = z.enum([
  'NOUVELLE', 'EN_COURS', 'ATTENTE_CLIENT', 'CONFIRMEE', 'ANNULEE', 'PERDUE',
])

export const TypeEvenementSchema = z.enum([
  'MARIAGE', 'DINER_ENTREPRISE', 'ANNIVERSAIRE', 'SEMINAIRE',
  'PRIVATISATION', 'BAPTEME', 'COCKTAIL', 'AUTRE',
])

export const ReservationPubliqueSchema = z.object({
  restaurantSlug: z.string().min(1).max(100).trim(),
  contactNom: z.string().min(1).max(120).trim(),
  contactEmail: z.string().email().max(200).toLowerCase(),
  contactTelephone: z.string().max(30).trim().optional(),
  typeEvenement: TypeEvenementSchema.optional(),
  dateEvenement: z.string().date().optional(),
  nbInvites: z.number().int().min(1).max(5000).optional(),
  message: z.string().min(1).max(2000).trim(),
})

export const CreateDemandeSchema = z.object({
  contactNom: z.string().min(1).max(120).trim(),
  contactEmail: z.string().email().max(200).toLowerCase(),
  contactSociete: z.string().max(120).trim().optional(),
  contactTelephone: z.string().max(30).trim().optional(),
  typeEvenement: TypeEvenementSchema.optional(),
  dateEvenement: z.string().date().optional(),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  nbInvites: z.number().int().min(1).max(5000).optional(),
  espaceId: z.string().uuid().optional(),
  notes: z.string().max(5000).trim().optional(),
})

export const PatchDemandeSchema = z.object({
  statut: StatutDemandeSchema.optional(),
  notes: z.string().max(5000).trim().optional(),
  espaceId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  typeEvenement: TypeEvenementSchema.nullable().optional(),
  dateEvenement: z.string().date().nullable().optional(),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  nbInvites: z.number().int().min(1).max(5000).nullable().optional(),
  contraintesAlimentaires: z.array(z.string().min(1).max(60)).max(20).optional(),
  conflitOverride: z.boolean().optional(),
}).strict()

export const PatchContactSchema = z.object({
  nom: z.string().min(1).max(120).trim().optional(),
  telephone: z.string().max(30).trim().nullable().optional(),
  societe: z.string().max(120).trim().nullable().optional(),
  notes: z.string().max(5000).trim().nullable().optional(),
}).strict()

export const EmailExtractionSchema = z.object({
  isDemandeEvenement: z.boolean(),
  nomContact: z.string().max(120).nullable().optional(),
  emailContact: z.string().email().optional(),
  societeContact: z.string().max(120).nullable().optional(),
  telephoneContact: z.string().max(30).nullable().optional(),
  typeEvenement: TypeEvenementSchema.nullable().optional(),
  dateEvenement: z.string().nullable().optional(),
  heureDebut: z.string().nullable().optional(),
  heureFin: z.string().nullable().optional(),
  nbInvites: z.number().int().min(1).nullable().optional(),
  contraintesAlimentaires: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
})
