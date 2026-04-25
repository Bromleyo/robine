# CURRENT_STATE.md — Robin v2
> Brief technique destiné à une IA externe. Factuel, basé sur lecture directe du code. Généré le 2026-04-24.

---

## 1. Vue d'ensemble

**Nom du projet :** Robin v2  
**Objectif métier :** CRM événementiel pour restaurant gastronomique. Centralise la réception, le traitement et le suivi des demandes d'événements privés (mariages, séminaires, privatisations, anniversaires, etc.). Permet de répondre aux clients directement depuis l'app via email Outlook.  
**Utilisateurs cibles :** L'équipe événementielle interne du restaurant (responsables, observateurs). Pas de portail client.  
**Démarrage estimé :** début 2025.  
**Avancement global :** ~85 %. L'application est fonctionnelle de bout en bout. Il manque du polish UI sur certaines pages et le système de filtrage email pre-LLM n'est pas encore implémenté.

### Ce qui fonctionne
- Réception automatique des emails entrants via Microsoft Graph webhook
- Classification IA des emails et création automatique de demandes
- CRM complet : liste, fiche détaillée, statuts, assignation, notes, pièces jointes
- Réponse email depuis l'app (avec historique de conversation)
- Génération de brouillon IA
- Templates de messages réutilisables
- Calendrier des événements
- Contacts avec historique
- Analytics (KPIs, répartition, graphe mensuel)
- Export CSV
- Devis PDF (HTML print-ready)
- Anonymisation RGPD des contacts
- Gestion multi-boîtes Outlook (toggle actif/inactif)
- Formulaire public de réservation (endpoint sans auth, pour intégration site web)
- Notifications in-app temps réel (polling)
- Détection de conflits de dates

### Ce qui n'est pas encore en prod / en cours
- Filtres pre-LLM sur les emails entrants (pas encore codé — objet de discussion actuelle)
- Bucket Supabase `pieces-jointes` à créer manuellement en production avant que les uploads fonctionnent
- Resend (emails transactionnels) : package installé, clé dans .env.example, mais utilisation non retrouvée dans le code — à vérifier

---

## 2. Stack technique complète

| Couche | Technologie | Version |
|--------|-------------|---------|
| Langage | TypeScript | ^5 |
| Framework full-stack | Next.js (App Router) | 16.2.4 |
| Runtime UI | React | 19.2.4 |
| ORM | Prisma | ^7.7.0 |
| Base de données | PostgreSQL via Supabase | — |
| Auth | NextAuth v5 (beta.31) + @auth/prisma-adapter | — |
| OAuth provider | Microsoft Azure AD (MSAL) | @azure/msal-node ^5.1.3 |
| API Graph | @microsoft/microsoft-graph-client | ^3.0.7 |
| IA / LLM | Anthropic Claude Haiku | @anthropic-ai/sdk ^0.90.0 |
| Storage fichiers | Supabase Storage | @supabase/supabase-js ^2.104.0 |
| Email transactionnel | Resend | ^6.12.2 (usage à vérifier) |
| Validation | Zod | ^4.3.6 |
| Logger | Pino | ^10.3.1 |
| Dates | date-fns + date-fns-tz | ^4 / ^3 |
| Tests | Vitest | ^4.1.5 |
| Linting | ESLint | ^9 |
| CSS | Tailwind CSS | ^4 (+ inline styles majoritairement) |
| Gestionnaire de paquets | npm | — |
| Hébergement | À vérifier (Vercel probable d'après NEXTAUTH_URL dans .env.example) |

---

## 3. Arborescence du projet

```
robin-v2/
├── prisma/
│   └── schema.prisma
├── public/
├── src/
│   ├── app/
│   │   ├── (app)/                    # Routes protégées (layout avec sidebar)
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx
│   │   │   ├── calendar/
│   │   │   │   └── page.tsx
│   │   │   ├── config/
│   │   │   │   ├── espaces/
│   │   │   │   ├── mailboxes/
│   │   │   │   ├── menus/
│   │   │   │   ├── restaurant/
│   │   │   │   └── templates/
│   │   │   ├── contacts/
│   │   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── demandes/
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── admin/
│   │   │   │   └── setup-subscription/route.ts
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/route.ts
│   │   │   ├── contacts/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── anonymize/route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── cron/
│   │   │   │   ├── renew-subscriptions/route.ts
│   │   │   │   └── urgence/route.ts
│   │   │   ├── demandes/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── ai-draft/route.ts
│   │   │   │   │   ├── attachments/
│   │   │   │   │   │   ├── [attachmentId]/route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── devis/route.ts
│   │   │   │   │   ├── messages/route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── export/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── espaces/
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── mailboxes/
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── membres/route.ts
│   │   │   ├── menus/
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── notifications/
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── route.ts
│   │   │   ├── onboarding/route.ts
│   │   │   ├── reservation/route.ts
│   │   │   ├── restaurant/route.ts
│   │   │   ├── templates/
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── route.ts
│   │   │   └── webhooks/
│   │   │       └── graph/route.ts
│   │   ├── login/
│   │   └── layout.tsx
│   ├── auth.ts
│   ├── auth.config.ts
│   ├── middleware.ts
│   ├── components/
│   │   ├── config/
│   │   │   └── mailboxes-client.tsx
│   │   ├── contacts/
│   │   │   └── anonymize-button.tsx
│   │   ├── detail/
│   │   │   ├── assignee-selector.tsx
│   │   │   ├── attachments-panel.tsx
│   │   │   ├── notes-editor.tsx
│   │   │   ├── reply-form.tsx
│   │   │   └── status-selector.tsx
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   └── topbar.tsx
│   │   └── ui/
│   │       └── icon.tsx
│   └── lib/
│       ├── business/
│       │   ├── conflit.ts
│       │   └── urgence.ts
│       ├── db/
│       │   ├── demandes.ts
│       │   ├── notifications.ts
│       │   ├── prisma.ts
│       │   └── supabase.ts
│       ├── graph/
│       │   ├── auth.ts
│       │   ├── messages.ts
│       │   └── subscription.ts
│       ├── llm/
│       │   └── extract-email.ts
│       ├── logger.ts
│       ├── rate-limit.ts
│       └── validation/
│           └── schemas.ts
├── .env.example
├── package.json
├── prisma/schema.prisma
└── tsconfig.json
```

---

## 4. Schéma de base de données

Géré par Prisma, hébergé sur Supabase PostgreSQL. Pas de migrations SQL versionnées retrouvées (probablement `prisma db push` utilisé).

### Enums

```
RoleUtilisateur   : ADMIN | RESPONSABLE | OBSERVATEUR
StatutDemande     : NOUVELLE | EN_COURS | ATTENTE_CLIENT | CONFIRMEE | ANNULEE | PERDUE
TypeEvenement     : MARIAGE | DINER_ENTREPRISE | ANNIVERSAIRE | SEMINAIRE | PRIVATISATION | BAPTEME | COCKTAIL | AUTRE
OrigineDemande    : EMAIL | FORMULAIRE | TELEPHONE
DirectionMessage  : IN | OUT
ObjectifTemplate  : PROPOSITION | RELANCE | DEVIS | CONFIRMATION | REFUS | AUTRE
TypeNotification  : NOUVELLE_DEMANDE | NOUVEAU_MESSAGE | DEMANDE_ASSIGNEE | CONFLIT_DETECTE | DEMANDE_URGENTE
```

### Tables

**`restaurants`**
- id, slug (unique), nom, adresse, timezone, emailGroupes, graphSubscriptionId, graphSubscriptionExpiry, referenceSeq (auto-incrémenté pour les références EVT-XXXXX), createdAt, updatedAt
- Relations : memberships, invitations, contacts, espaces, demandes, menus, templates, mailboxes

**`users`**
- id, email (unique), nom, avatarColor, msAzureId, lastLoginAt, createdAt, updatedAt
- Relations : memberships, assignedDemandes, notifications, sentMessages

**`memberships`**
- id, userId, restaurantId, role (RoleUtilisateur), invitedBy, joinedAt, createdAt
- Unique : [userId, restaurantId]

**`invitations`**
- id, restaurantId, email, role, token (unique), invitedBy, expiresAt, acceptedAt, createdAt
- Unique : [restaurantId, email]

**`outlook_mailboxes`**
- id, restaurantId, email, displayName, msGraphId, subscriptionId, subscriptionExpiry, msAccessToken, msRefreshToken, msTokenExpiry, actif (bool), createdAt, updatedAt
- Unique : [restaurantId, email]

**`contacts`**
- id, restaurantId, email, nom, telephone, societe, notes, nbDemandesTotal, nbDemandesConfirmees, caTotalEstimeCents, anonymizedAt (null si non anonymisé), createdAt, updatedAt
- Unique : [restaurantId, email]

**`espaces`**
- id, restaurantId, nom, capaciteMax, capaciteMin, description, ordre, actif, createdAt, updatedAt

**`demandes`**
- id, restaurantId, reference (unique par restaurant), contactId, assigneeId, espaceId, menuSelectionneId
- statut (StatutDemande), typeEvenement, origine (OrigineDemande)
- dateEvenement, heureDebut, heureFin, nbInvites, budgetIndicatifCents (en centimes)
- contraintesAlimentaires (String[]), notes, urgenceScore, urgenceUpdatedAt
- conflitDetecte, conflitOverride, lastMessageAt, lastMessageDirection
- confirmedAt, annuleAt, createdAt, updatedAt
- Index : [restaurantId, statut], [restaurantId, dateEvenement], [restaurantId, espaceId, dateEvenement]

**`threads`**
- id, demandeId, subject, messageIdRoot, references (String[]), graphConversationId, createdAt, updatedAt

**`messages`**
- id, threadId, microsoftGraphId (unique), messageIdHeader, inReplyTo, references (String[])
- direction (IN/OUT), authorUserId, fromEmail, fromName, toEmails (String[]), ccEmails (String[])
- subject, bodyHtml (Text), bodyText (Text), isDraft, wasGeneratedByAI, extractedData (Json)
- sentAt, receivedAt, createdAt

**`menus`**
- id, restaurantId, nom, description, prixCents, regimesSupportes (String[]), joursDisponibles (Int[]), espacesCompatibles (String[]), minConvives, maxConvives, pdfUrl, actif, ordre, createdAt, updatedAt

**`templates`** (TemplateMessage)
- id, restaurantId, nom, objectif (ObjectifTemplate), subjectTemplate, bodyTemplate (Text), variables (String[]), actif, ordre, createdAt, updatedAt

**`notifications`**
- id, userId, restaurantId, type (TypeNotification), demandeId, titre, body, lu (bool), createdAt

**`pieces_jointes`**
- id, restaurantId, messageId, demandeId, storageUrl, filename, mimeType, sizeBytes, createdAt
- Stockage dans Supabase Storage, bucket `pieces-jointes` (à créer manuellement en prod)

**`webhook_events`**
- id, source, externalId, processedAt
- Unique : [source, externalId] — sert de verrou d'idempotence pour les webhooks Graph

---

## 5. Endpoints / Routes API

### Authentification
| Méthode | Path | Fonction |
|---------|------|----------|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth OAuth handlers |

### Demandes
| Méthode | Path | Fonction |
|---------|------|----------|
| GET | `/api/demandes` | Liste paginée/filtrée des demandes |
| POST | `/api/demandes` | Création manuelle d'une demande |
| GET | `/api/demandes/[id]` | Détail d'une demande |
| PUT/PATCH | `/api/demandes/[id]` | Mise à jour statut, assignee, champs |
| DELETE | `/api/demandes/[id]` | Suppression |
| POST | `/api/demandes/[id]/messages` | Envoi d'une réponse email via Graph |
| POST | `/api/demandes/[id]/ai-draft` | Génération brouillon IA (Claude Haiku) |
| GET | `/api/demandes/[id]/attachments` | Liste des pièces jointes |
| POST | `/api/demandes/[id]/attachments` | Upload fichier (Supabase Storage) |
| DELETE | `/api/demandes/[id]/attachments/[attachmentId]` | Suppression pièce jointe |
| GET | `/api/demandes/export` | Export CSV de toutes les demandes |
| GET | `/api/demandes/[id]/devis` | Génère et retourne un HTML imprimable (devis PDF) |

### Contacts
| Méthode | Path | Fonction |
|---------|------|----------|
| GET | `/api/contacts` | Liste des contacts |
| POST | `/api/contacts` | Création contact |
| GET | `/api/contacts/[id]` | Détail contact |
| PUT | `/api/contacts/[id]` | Mise à jour contact |
| DELETE | `/api/contacts/[id]` | Suppression |
| POST | `/api/contacts/[id]/anonymize` | Anonymisation RGPD (nullifie PII, pose anonymizedAt) |

### Configuration
| Méthode | Path | Fonction |
|---------|------|----------|
| GET | `/api/espaces` | Liste des espaces |
| POST | `/api/espaces` | Création espace |
| PUT | `/api/espaces/[id]` | Mise à jour espace |
| DELETE | `/api/espaces/[id]` | Suppression |
| GET | `/api/menus` | Liste des menus |
| POST | `/api/menus` | Création menu |
| PUT | `/api/menus/[id]` | Mise à jour menu |
| DELETE | `/api/menus/[id]` | Suppression |
| GET | `/api/templates` | Liste des templates |
| POST | `/api/templates` | Création template |
| PUT | `/api/templates/[id]` | Mise à jour template |
| DELETE | `/api/templates/[id]` | Suppression |
| GET | `/api/restaurant` | Paramètres restaurant |
| PUT | `/api/restaurant` | Mise à jour paramètres |
| GET | `/api/membres` | Liste des membres |
| GET | `/api/mailboxes` | Liste des boîtes Outlook |
| PUT | `/api/mailboxes/[id]` | Toggle actif/inactif d'une boîte |

### Notifications
| Méthode | Path | Fonction |
|---------|------|----------|
| GET | `/api/notifications` | Notifications non lues |
| PUT | `/api/notifications/[id]` | Marquer comme lue |

### Crons
| Méthode | Path | Fonction |
|---------|------|----------|
| GET | `/api/cron/urgence` | Recalcule les scores d'urgence |
| GET | `/api/cron/renew-subscriptions` | Renouvelle les subscriptions Graph expirantes |

### Endpoints publics (sans auth)
| Méthode | Path | Fonction |
|---------|------|----------|
| POST | `/api/reservation` | Formulaire public de demande (site web restaurant) |
| GET/POST | `/api/webhooks/graph` | Webhook Microsoft Graph (emails entrants) |

### Admin
| Méthode | Path | Fonction |
|---------|------|----------|
| POST | `/api/admin/setup-subscription` | Crée/renouvelle la subscription Graph pour la boîte principale |

---

## 6. Authentification et autorisations

**Mécanisme :** NextAuth v5 avec provider Microsoft Azure AD (OAuth 2.0).  
Les utilisateurs se connectent avec leur compte Microsoft professionnel.

**Stratégie JWT :**  
Le JWT embarque `userId`, `restaurantId`, `role`, `nom`, `avatarColor`.  
`restaurantId` est résolu via la première `Membership` de l'utilisateur.

**Middleware :** `src/middleware.ts` — protège toutes les routes sauf `/login`, `/api/auth/*`, `/api/webhooks/*`, `/api/reservation`.

**Rôles :**
- `ADMIN` — accès complet
- `RESPONSABLE` — accès opérationnel standard
- `OBSERVATEUR` — lecture seule (à vérifier si le gating est implémenté côté API)

**Multi-tenant :**  
Chaque requête est scopée par `restaurantId` extrait du JWT. Pas de RLS Supabase — l'isolation est faite applicativement via `where: { restaurantId }` dans tous les Prisma queries.

**Invitations :**  
Système d'invitation par email (table `invitations`, token unique, expiresAt).

---

## 7. Intégrations email actuelles

**Oui, intégration Microsoft Graph complète et fonctionnelle.**

### Flux entrant (réception)
1. Le SaaS s'abonne à la boîte `event@le-robin.fr` via Graph API (`POST /subscriptions`, resource : `users/{email}/mailFolders/inbox/messages`, changeType : `created`).
2. Microsoft Graph envoie un POST à `/api/webhooks/graph` pour chaque nouvel email dans la boîte.
3. Le webhook fetch le message complet via Graph (`GET /users/{email}/messages/{id}`).
4. Filtre basique : ignore les auto-envois (from === mailbox email).
5. Si thread existant → ajoute le message à la demande existante.
6. Si nouveau thread → appel LLM pour classification. Si `isDemandeEvenement: true` → crée contact + demande + thread + message.

**Problème connu :** Aucun pré-filtre avant le LLM. Chaque email (spam, newsletters, fournisseurs...) génère un appel Claude. Une amélioration est en cours de conception : filtres par destinataire explicite, headers spam, et mots-clés métier (événement, mariage, privatisation, anniversaire, devis, comité d'entreprise, réservation, etc.).

### Flux sortant (envoi)
- Via Graph API : `POST /users/{mailbox}/messages/{id}/createReply` → PATCH du brouillon → `/send`
- L'email est envoyé depuis la boîte Outlook connectée, avec threading correct (In-Reply-To, References).

### Renouvellement des subscriptions
- Les subscriptions Graph expirent après **3 jours**.
- Un cron `GET /api/cron/renew-subscriptions` renouvelle celles qui expirent dans les 24h.
- Sécurisé par header `x-cron-secret`.

### Boîtes configurées
- `event@le-robin.fr` — boîte principale dédiée aux événements
- Architecture multi-mailbox en place (table `outlook_mailboxes`), UI de gestion disponible.

### Resend
- Package installé, clé dans `.env.example`. Pas retrouvé d'utilisation dans le code — probablement prévu mais pas encore implémenté.

---

## 8. Intégrations IA actuelles

**Modèle utilisé :** Claude Haiku (`claude-haiku-4-5-20251001`) via `@anthropic-ai/sdk`.

### 1. Classification et extraction d'email (`src/lib/llm/extract-email.ts`)
- Appelé pour chaque nouvel email sans thread existant.
- Retourne un JSON structuré : `isDemandeEvenement`, `typeEvenement`, `dateEvenement`, `nbInvites`, `budgetIndicatifCents`, `contraintesAlimentaires`, `nomContact`, `societeContact`, `telephoneContact`, `confidence`.
- Validation du JSON par Zod avant utilisation.
- Fallback si parsing échoue : `isDemandeEvenement: true` avec notes = premier 500 chars du mail.
- Max 4000 chars d'email envoyés au LLM.

### 2. Génération de brouillon de réponse (`POST /api/demandes/[id]/ai-draft`)
- Construit un contexte à partir des informations de la demande + historique des messages.
- Supporte le mode "modifier un brouillon existant" avec instruction.
- Retourne uniquement le corps de l'email (sans objet ni HTML).
- Max 800 chars par message dans l'historique.

**Aucun autre LLM en place.**

---

## 9. Variables d'environnement

Fichier de référence : `.env.example`

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL Supabase avec PgBouncer (pour Prisma en prod) |
| `DIRECT_URL` | URL Supabase directe (pour migrations Prisma) |
| `NEXTAUTH_URL` | URL publique de l'app |
| `NEXTAUTH_SECRET` | Secret JWT NextAuth |
| `AZURE_AD_CLIENT_ID` | Client ID de l'app Azure (OAuth + Graph) |
| `AZURE_AD_CLIENT_SECRET` | Secret de l'app Azure |
| `AZURE_AD_TENANT_ID` | Tenant ID Azure (`common` pour multi-tenant) |
| `MS_GRAPH_WEBHOOK_URL` | URL publique du endpoint webhook Graph |
| `MS_GRAPH_WEBHOOK_SECRET` | Secret de validation des webhooks Graph |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (Claude Haiku) |
| `RESEND_API_KEY` | Clé API Resend (usage à vérifier) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase (côté client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anonyme Supabase (côté client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role Supabase (upload fichiers côté serveur) |
| `CRON_SECRET` | Secret pour sécuriser les endpoints cron |
| `NEXT_PUBLIC_APP_URL` | URL de l'app (côté client) |
| `APP_SECRET` | Secret applicatif générique |

**Note importante :** Dans le code webhook (`src/app/api/webhooks/graph/route.ts`), la variable lue est `process.env.GRAPH_WEBHOOK_SECRET` mais le `.env.example` l'appelle `MS_GRAPH_WEBHOOK_SECRET`. Incohérence à corriger.

---

## 10. Fonctionnalités déjà livrées

- **Connexion OAuth Microsoft** — login avec compte professionnel Azure AD
- **Onboarding restaurant** — setup du restaurant au premier login
- **Réception emails automatique** — webhook Graph, création automatique de demandes depuis les emails
- **Classification IA** — détection et extraction structurée des demandes événementielles
- **Liste des demandes** — avec filtres par statut, recherche, tri, badge de nouvelles demandes
- **Fiche demande complète** — contact, événement, thread email, statut, assignation, notes, pièces jointes
- **Réponse email depuis l'app** — envoi via Outlook, threading correct
- **Brouillon IA** — génération et édition d'une réponse suggérée par Claude
- **Templates de messages** — avec variables dynamiques (contact.nom, demande.dateEvenement, etc.)
- **Détection de conflits** — alerte si deux demandes sur la même date/espace
- **Score d'urgence** — calcul automatique basé sur date événement, statut, dernier message
- **Calendrier** — vue calendrier des demandes avec dates d'événement
- **Contacts** — liste avec historique demandes, anonymisation RGPD
- **Espaces** — configuration des salles/espaces disponibles
- **Menus** — configuration des menus avec prix, régimes, capacités
- **Analytics** — KPIs (total, confirmées, CA, pipeline), répartition par statut/type, graphe mensuel
- **Export CSV** — export de toutes les demandes
- **Devis PDF** — génération HTML imprimable par demande
- **Multi-mailbox UI** — liste et toggle des boîtes Outlook connectées
- **Pièces jointes** — upload/téléchargement sur Supabase Storage
- **Notifications in-app** — nouvelles demandes, nouveaux messages, conflits
- **Formulaire public** — endpoint pour intégration sur le site web du restaurant

---

## 11. Fonctionnalités en cours / planifiées

**En cours de conception :**
- **Filtres pre-LLM sur les emails entrants** — 3 couches avant l'appel Claude :
  - Couche 1 : vérifier que `event@le-robin.fr` est dans les destinataires explicites (to/cc)
  - Couche 2 : rejeter les emails avec headers spam (List-Unsubscribe, Auto-Submitted, noreply@)
  - Couche 3 : keyword matching sur sujet+corps (mariage, privatisation, anniversaire, séminaire, devis, réservation, comité d'entreprise, cocktail, baptême, etc.)

---

## 12. Points de friction / Dette technique connue

1. **Incohérence variable d'env** : `GRAPH_WEBHOOK_SECRET` dans le code vs `MS_GRAPH_WEBHOOK_SECRET` dans `.env.example`.

2. **Bucket Supabase Storage non créé en prod** : le bucket `pieces-jointes` doit être créé manuellement dans la console Supabase avant que les uploads fonctionnent en production.

3. **Pas de pré-filtres email** : tous les emails entrants (même spam) déclenchent un appel Claude Haiku → coût en tokens inutile.

4. **Expiration subscriptions Graph sans alerte** : les subscriptions expirent tous les 3 jours. Si le cron rate une exécution, la boîte devient silencieuse sans notification.

5. **Rôles non gatés côté API** : le champ `role` est stocké dans le JWT mais les endpoints API ne semblent pas différencier `ADMIN` / `RESPONSABLE` / `OBSERVATEUR` — accès probablement uniforme pour tous les membres connectés.

6. **Pas de pagination** : la liste des demandes charge probablement tout en base — à surveiller quand le volume grossit.

7. **Resend non utilisé** : package installé, clé attendue, mais aucune utilisation retrouvée dans le code. Prévu pour les invitations / notifications email ?

8. **Pas de migrations SQL versionnées** : probablement `prisma db push` utilisé, ce qui rend les rollbacks difficiles.

9. **Inline styles majoritaires** : le code UI utilise massivement `style={{ }}` inline. Cohérent mais difficile à thémiser ou à maintenir à grande échelle.

---

## 13. Conventions de code

**Langage :** TypeScript strict.

**Nommage :**
- Variables/fonctions : `camelCase`
- Colonnes DB (Prisma) : `camelCase` côté code, mappé vers `snake_case` en BDD (`@@map("nom_table")`)
- Composants React : `PascalCase`
- Fichiers composants : `kebab-case.tsx`
- Fichiers lib : `kebab-case.ts`

**Structure des routes API :**
- Toutes les routes vérifient `session?.user?.restaurantId` en premier
- `params` est toujours `Promise<{ id: string }>` (Next.js 15+ App Router pattern)
- Retournent `NextResponse.json(...)` avec status HTTP explicite

**Structure des composants :**
- Server components par défaut pour les pages (`async function PageName()`)
- `'use client'` uniquement quand interactivité nécessaire
- Pas de state management global (pas de Zustand/Redux) — état local React ou fetch direct

**Tests :**
- Vitest configuré, scripts `test`, `test:watch`, `test:coverage` disponibles
- Couverture réelle des tests : à vérifier

**Linting :**
- `eslint-config-next` configuré
- Pas de Prettier retrouvé dans `package.json`

**Logger :**
- Pino (`src/lib/logger.ts`) utilisé dans le webhook Graph
- Ailleurs : `console.error` / `console.log` directs (pas uniformisé)

**Commits :** Convention non documentée dans le repo.
