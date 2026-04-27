# Robin-v2 — Vue d'ensemble

## Ce qu'est l'application

Robin est un outil SaaS multi-restaurant de gestion des demandes événementielles. Un restaurant reçoit des emails de clients pour des privatisations, mariages, séminaires, etc. Robin centralise tout ça, aide à répondre, et suit chaque demande jusqu'à la confirmation.

---

## Modèle de données central

```
Restaurant
  └── OutlookMailbox       boîte mail connectée (Microsoft Exchange)
  └── Espace               salles disponibles (La Cave, Le Salon…)
  └── Menu                 formules événementielles avec prix
  └── User + Membership    équipe avec rôles ADMIN / RESPONSABLE / OBSERVATEUR
  └── Demande              cœur du système
        └── Contact        le client
        └── Thread         fil de conversation email
              └── Message  messages individuels (IN / OUT)
        └── PieceJointe    fichiers attachés
  └── ConversationExample  exemples RAG pour l'IA
        └── ConversationExampleMessage
```

---

## Cycle de vie d'une demande

```
Email client reçu
  → Webhook Microsoft Graph
  → Extraction LLM (type événement, date, nb convives, budget…)
  → Demande créée — statut : NOUVELLE
  → Assignée à un responsable
  → Échanges email dans l'interface (brouillons IA, templates)
  → NOUVELLE → EN_COURS → ATTENTE_CLIENT → CONFIRMEE / ANNULEE / PERDUE
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 / React 19 — App Router |
| Base de données | PostgreSQL + Prisma (multi-tenant par `restaurantId`) |
| Auth | NextAuth v5 — SSO Microsoft Azure AD |
| Email | Microsoft Graph API — webhooks temps réel + polling cron fallback |
| IA | Anthropic Claude Haiku — extraction de données + génération de brouillons |
| Hébergement | Vercel (crons natifs, edge middleware) |

---

## Fonctionnalités

| Module | Description |
|---|---|
| **Demandes** | Liste, détail, statuts, assignation, score d'urgence, détection de conflits de salle |
| **Messagerie** | Thread email intégré, brouillons IA, templates, pièces jointes |
| **Contacts** | CRM léger, historique par client, anonymisation GDPR |
| **Calendrier** | Vue des événements confirmés |
| **Analytique** | Métriques de conversion, CA estimé |
| **Config** | Espaces, menus, boîtes mail, templates, règles IA, imprimantes |
| **RAG** | Exemples few-shot extraits de vrais échanges Outlook pour améliorer la génération IA |

---

## Pages de l'application

### Pilotage
- `/dashboard` — tableau de bord général
- `/demandes` — liste des demandes
- `/demandes/[id]` — détail d'une demande
- `/contacts` — contacts clients
- `/calendar` — calendrier des événements
- `/analytics` — statistiques

### Configuration (`/config`)
- `/config/restaurant` — paramètres du restaurant
- `/config/espaces` — gestion des salles
- `/config/menus` — formules événementielles
- `/config/mailboxes` — boîtes mail connectées
- `/config/templates` — modèles d'email
- `/config/imprimantes` — imprimantes réseau
- `/config/regles-ia` — règles de comportement IA
- `/config/conversations` — exemples RAG (curation des conversations Outlook)
- `/config/emails-rejetes` — emails rejetés à réhabiliter

---

## Authentification & sécurité

- Login SSO Microsoft (Azure AD) uniquement
- Session NextAuth avec `restaurantId` + `role` dans le JWT
- Routes admin protégées par `requireRole(session.user.role, 'ADMIN')`
- Tokens Microsoft Graph stockés chiffrés en base (`OutlookMailbox`)

---

## Système RAG (Retrieval-Augmented Generation)

### Objectif
Donner à l'IA des exemples réels d'échanges passés pour qu'elle génère des brouillons dans le style du restaurant.

### Flux
1. **Extraction** — `/config/conversations` → "Extraire les conversations" → pull des 12 derniers mois depuis Outlook, groupé par `conversationId`, stocké en statut `PENDING`
2. **Curation** — review manuelle de chaque thread : assignation d'un type d'événement (Mariage, Cocktail…), approbation ou rejet
3. **Injection** — lors de chaque génération de brouillon (`/api/demandes/[id]/ai-draft`), 3–5 exemples `APPROVED` du même type sont injectés en few-shot dans le prompt Claude

### Fichiers clés
| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` | Modèles `ConversationExample` + `ConversationExampleMessage` |
| `src/lib/rag/examples.ts` | `getRelevantExamples()` — fetch + formatage few-shot |
| `src/app/api/admin/extract-conversations/route.ts` | Extraction depuis Microsoft Graph |
| `src/app/api/admin/conversations/route.ts` | Liste paginée avec filtres |
| `src/app/api/admin/conversations/[id]/route.ts` | Détail + approve/reject |
| `src/app/api/demandes/[id]/ai-draft/route.ts` | Génération brouillon avec injection RAG |
| `src/components/config/conversations-client.tsx` | UI de curation |

### Point ouvert
Le pre-filtrage avant extraction reste à implémenter : sans filtre, l'extraction remonte potentiellement ~15k emails. La solution envisagée est un filtre par mots-clés sur le sujet côté Graph API avant stockage.

---

## Types d'événements

`MARIAGE` · `DINER_ENTREPRISE` · `ANNIVERSAIRE` · `SEMINAIRE` · `PRIVATISATION` · `BAPTEME` · `COCKTAIL` · `AUTRE`

## Rôles utilisateurs

`ADMIN` · `RESPONSABLE` · `OBSERVATEUR`

## Statuts d'une demande

`NOUVELLE` · `EN_COURS` · `ATTENTE_CLIENT` · `CONFIRMEE` · `ANNULEE` · `PERDUE`
