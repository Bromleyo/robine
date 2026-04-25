-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('ADMIN', 'RESPONSABLE', 'OBSERVATEUR');

-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('NOUVELLE', 'EN_COURS', 'ATTENTE_CLIENT', 'CONFIRMEE', 'ANNULEE', 'PERDUE');

-- CreateEnum
CREATE TYPE "TypeEvenement" AS ENUM ('MARIAGE', 'DINER_ENTREPRISE', 'ANNIVERSAIRE', 'SEMINAIRE', 'PRIVATISATION', 'BAPTEME', 'COCKTAIL', 'AUTRE');

-- CreateEnum
CREATE TYPE "OrigineDemande" AS ENUM ('EMAIL', 'FORMULAIRE', 'TELEPHONE');

-- CreateEnum
CREATE TYPE "DirectionMessage" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ObjectifTemplate" AS ENUM ('PROPOSITION', 'RELANCE', 'DEVIS', 'CONFIRMATION', 'REFUS', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeNotification" AS ENUM ('NOUVELLE_DEMANDE', 'NOUVEAU_MESSAGE', 'DEMANDE_ASSIGNEE', 'CONFLIT_DETECTE', 'DEMANDE_URGENTE');

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "emailGroupes" TEXT NOT NULL,
    "graphSubscriptionId" TEXT,
    "graphSubscriptionExpiry" TIMESTAMP(3),
    "referenceSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlook_mailboxes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "msGraphId" TEXT,
    "subscriptionId" TEXT,
    "subscriptionExpiry" TIMESTAMP(3),
    "msAccessToken" TEXT,
    "msRefreshToken" TEXT,
    "msTokenExpiry" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlook_mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL DEFAULT 'RESPONSABLE',
    "avatarColor" TEXT NOT NULL DEFAULT '#9F1239',
    "msAzureId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "societe" TEXT,
    "notes" TEXT,
    "nbDemandesTotal" INTEGER NOT NULL DEFAULT 0,
    "nbDemandesConfirmees" INTEGER NOT NULL DEFAULT 0,
    "caTotalEstimeCents" INTEGER NOT NULL DEFAULT 0,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espaces" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "capaciteMax" INTEGER NOT NULL,
    "capaciteMin" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "espaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "espaceId" TEXT,
    "menuSelectionneId" TEXT,
    "statut" "StatutDemande" NOT NULL DEFAULT 'NOUVELLE',
    "typeEvenement" "TypeEvenement",
    "origine" "OrigineDemande" NOT NULL,
    "dateEvenement" TIMESTAMP(3),
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "nbInvites" INTEGER,
    "budgetIndicatifCents" INTEGER,
    "contraintesAlimentaires" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "urgenceScore" INTEGER NOT NULL DEFAULT 0,
    "urgenceUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conflitDetecte" BOOLEAN NOT NULL DEFAULT false,
    "conflitOverride" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageDirection" "DirectionMessage",
    "confirmedAt" TIMESTAMP(3),
    "annuleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demandes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "messageIdRoot" TEXT NOT NULL,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "graphConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "microsoftGraphId" TEXT,
    "messageIdHeader" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "direction" "DirectionMessage" NOT NULL,
    "authorUserId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmails" TEXT[],
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "wasGeneratedByAI" BOOLEAN NOT NULL DEFAULT false,
    "extractedData" JSONB,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "prixCents" INTEGER NOT NULL,
    "regimesSupportes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joursDisponibles" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "espacesCompatibles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minConvives" INTEGER,
    "maxConvives" INTEGER,
    "pdfUrl" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "objectif" "ObjectifTemplate" NOT NULL,
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "TypeNotification" NOT NULL,
    "demandeId" TEXT,
    "titre" TEXT NOT NULL,
    "body" TEXT,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces_jointes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "messageId" TEXT,
    "demandeId" TEXT,
    "storageUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_jointes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "outlook_mailboxes_restaurantId_email_key" ON "outlook_mailboxes"("restaurantId", "email");

-- CreateIndex
CREATE INDEX "users_restaurantId_idx" ON "users"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_restaurantId_email_key" ON "users"("restaurantId", "email");

-- CreateIndex
CREATE INDEX "contacts_restaurantId_idx" ON "contacts"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_restaurantId_email_key" ON "contacts"("restaurantId", "email");

-- CreateIndex
CREATE INDEX "espaces_restaurantId_idx" ON "espaces"("restaurantId");

-- CreateIndex
CREATE INDEX "demandes_restaurantId_statut_idx" ON "demandes"("restaurantId", "statut");

-- CreateIndex
CREATE INDEX "demandes_restaurantId_dateEvenement_idx" ON "demandes"("restaurantId", "dateEvenement");

-- CreateIndex
CREATE INDEX "demandes_restaurantId_espaceId_dateEvenement_idx" ON "demandes"("restaurantId", "espaceId", "dateEvenement");

-- CreateIndex
CREATE UNIQUE INDEX "demandes_restaurantId_reference_key" ON "demandes"("restaurantId", "reference");

-- CreateIndex
CREATE INDEX "threads_demandeId_idx" ON "threads"("demandeId");

-- CreateIndex
CREATE INDEX "threads_messageIdRoot_idx" ON "threads"("messageIdRoot");

-- CreateIndex
CREATE UNIQUE INDEX "messages_microsoftGraphId_key" ON "messages"("microsoftGraphId");

-- CreateIndex
CREATE INDEX "messages_threadId_idx" ON "messages"("threadId");

-- CreateIndex
CREATE INDEX "menus_restaurantId_actif_idx" ON "menus"("restaurantId", "actif");

-- CreateIndex
CREATE INDEX "templates_restaurantId_idx" ON "templates"("restaurantId");

-- CreateIndex
CREATE INDEX "notifications_userId_lu_idx" ON "notifications"("userId", "lu");

-- CreateIndex
CREATE INDEX "pieces_jointes_messageId_idx" ON "pieces_jointes"("messageId");

-- CreateIndex
CREATE INDEX "pieces_jointes_demandeId_idx" ON "pieces_jointes"("demandeId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_source_externalId_key" ON "webhook_events"("source", "externalId");

-- AddForeignKey
ALTER TABLE "outlook_mailboxes" ADD CONSTRAINT "outlook_mailboxes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espaces" ADD CONSTRAINT "espaces_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes" ADD CONSTRAINT "demandes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes" ADD CONSTRAINT "demandes_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes" ADD CONSTRAINT "demandes_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes" ADD CONSTRAINT "demandes_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "espaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes" ADD CONSTRAINT "demandes_menuSelectionneId_fkey" FOREIGN KEY ("menuSelectionneId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demandes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces_jointes" ADD CONSTRAINT "pieces_jointes_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces_jointes" ADD CONSTRAINT "pieces_jointes_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
