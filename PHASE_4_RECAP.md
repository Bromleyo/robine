# PHASE 4 — RECAP
_Depuis PHASE_3_RECAP.md (29 avril matin) — mis à jour le 29 avril 2026, soir_

---

## Ce qui a été fait

### 1. Audit + nettoyage des faux positifs

Audit exhaustif des demandes créées dans Robin pour distinguer les vraies demandes des faux positifs (`jimmy@gmail`, mails de test, mailings prospection).

- `5bddc60` — Nettoyage des données de test (`jimmy@gmail`) + ajout du sender en blacklist directement dans le pipeline.
- Scripts d'audit one-shot : `audit-test-data.ts`, `audit-restaurant2-info.ts`, `audit-import-info.ts`, `audit-accept-directs.ts`, `delete-fp-demandes.ts`. Chaque script identifie une catégorie précise de faux positifs et propose un mode dry-run / --execute.

### 2. Consolidation 3 restaurants → 1

Le tenant historique (`cmo9zkt…`) avait des doublons et de la pollution. Migration des données utiles vers le restaurant survivant `cmoecboxx`.

- `1819bd4` — Savepoint avant migration.
- Scripts : `migrate-cmo9zkt.ts`, `triage-cmo9zkt.ts`, `migrate-test-data.ts`, `delete-dr0063.ts`, `delete-dr0065.ts` (étapes 1 et 2 de la consolidation).
- **Résultat** : un seul restaurant actif en prod, `cmoecboxx`, avec ses memberships, contacts, demandes, threads et mailbox propres.

### 3. Threading robuste (RFC 2822)

Avant : un message de réponse n'était attaché à un thread existant que via `conversationId` Microsoft Graph. Si Graph ne le fournissait pas (cas observé en prod), le message créait un nouveau thread orphelin.

- `459e330` — Fallback en cascade sur `inReplyTo` puis sur l'array `references` RFC 2822 dans `process-incoming.ts`. Le fichier `process-incoming.test.ts` couvre ces fallbacks.

### 4. Fix bug `FALLBACK_PARSE_ERROR`

Le pipeline laissait certains emails LLM en `pending` retry indéfiniment, sans jamais les marquer comme rejetés. Cause : la fonction de fallback parse renvoyait `true` au lieu de `false`.

- `83ea78e` — Force `FALLBACK_PARSE_ERROR → false` (donc rejet propre) + bump retry limit à 500 + blacklist `ledelas.fr`.
- `5be6a4e` et `095188f` — Endpoints admin one-shot `retry-llm-pending` et `retry-llm-from-info` pour repasser les ~180 emails LLM en erreur dans le pipeline corrigé.

### 5. Retro-log systématique des LLM rejects

Avant : les emails rejetés par le LLM (verdict `non-event`) n'étaient loggés dans `rejectedEmails` que si une `softRejectReason` était présente. Sinon ils disparaissaient silencieusement de l'audit trail.

- `8bcff27` — Log systématique de tous les rejets LLM, peu importe la raison.
- `b4915a6` — Endpoint admin `/api/admin/retro-log-llm-rejects` pour rétro-loguer les rejets antérieurs au fix (~30 jours d'historique Graph).

### 6. Blacklists durcies (couche 1)

Renforcement des filtres pour couper net les sources de bruit récurrentes.

- `5bddc60` — Sender `jimmy.dubreuil@gmail.com`
- `f42df66` — Domaines `ACMS`, `PayPal` + phrases de prospection B2B
- `83ea78e` — Domaine `ledelas.fr`
- `8bcff27` — Domaine `cachaca.rio`
- `01c4c6b` — Patterns expéditeurs automatiques (`noreply@*`, `mailer@*`, `bounces@*`), ESP (`*.sendgrid.net`, `*.mailgun.org`, `*.amazonses.com`), distributeurs (`*.constantcontact.com`, etc.)

### 7. Fix SSO onboarding via `allowedDomains` _(cette session)_

Avant : chaque nouveau login (`info@le-robin.fr`, `lucia@…`) créait un *nouveau* restaurant à la place de rejoindre celui de l'organisation. Conséquence directe : 3 restaurants au lieu d'1, données dispersées (cf. point 2).

**Architecture du fix :**

- `96ab127` — Schema Prisma : ajout du champ `allowedDomains String[] @default([])` sur `Restaurant`.
- `d38d182` _(cette session)_ — Logique d'auto-attachement :
  - **`src/lib/onboarding.ts`** — `extractEmailDomain()` (lowercase, trim, last `@`) + `attachUserToMatchingRestaurant()` (cherche un restaurant via `allowedDomains.has(domain)`, upsert membership `RESPONSABLE` si match, idempotent).
  - **`src/auth.ts`** — Au login JWT, si l'utilisateur n'a aucune membership, on tente l'auto-attach. Si succès, le token reçoit immédiatement `restaurantId` et `role` (l'utilisateur ne voit jamais `/onboarding`).
  - **`src/app/api/onboarding/route.ts`** — Même logique en filet de sécurité côté API ; sinon onboarding normal qui crée un restaurant **avec** `allowedDomains = [domaine du créateur]` pour préparer l'arrivée des collègues.
  - **Tests `src/lib/onboarding.test.ts`** — 11 tests verts couvrant les 4 cas du brief (`@le-robin.fr` → cmoecboxx, `@lerobin78.onmicrosoft.com` → cmoecboxx, `@autre-domaine.com` → onboarding normal, second user `@autre-domaine.com` → rejoint le restaurant créé en RESPONSABLE) + idempotence (un même user qui se reconnecte ne crée pas de doublon) + edge cases sur `extractEmailDomain` (case-insensitive, sous-domaines, emails malformés).
  - **`scripts/seed-allowed-domains.ts`** — Script one-shot pour seeder `cmoecboxx` avec `['le-robin.fr', 'lerobin78.onmicrosoft.com']` (dry-run par défaut, `--execute` pour appliquer).
  - **`vitest.config.ts`** — Restreint la découverte des tests à `src/**` pour ne plus tenter d'exécuter les `.spec.ts` Playwright sous `tests/e2e/`.

> ⚠️ **Action manuelle requise** : exécuter `npx tsx scripts/seed-allowed-domains.ts --execute` pour activer effectivement l'auto-attach sur `cmoecboxx`. Sans le seed, la logique tourne mais ne matche rien.

---

## Situation actuelle

### Pipeline email — pleinement opérationnel

```
Email → info@le-robin.fr
    → Webhook Microsoft Graph (souscription DIRECTE sur info@, en temps réel)
    → Filtre 3 couches (L1 expéditeur/domaine, L2 headers, L3 business signals)
    → ACCEPT → Demande créée + thread résilient (RFC 2822 fallbacks)
    → REJECT → Loggé systématiquement dans rejectedEmails (incl. LLM rejects)
```

> 📌 **Correction d'architecture (vs PHASE_3_RECAP)** : la règle Outlook
> `info@ → event@` mentionnée en phase 3 **n'est PAS dans le path actif**.
> Le webhook Graph s'abonne directement à `info@le-robin.fr`. Pas de
> forwarding intermédiaire. Vérifié en DB le 2026-04-30 : la mailbox
> `info@le-robin.fr` (id `cmoem1rnj…`) est `actif=true` avec
> `subscriptionId` valide ; aucune mailbox `event@` n'est référencée
> côté `outlook_mailboxes` pour cmoecboxx.

- Blacklists couche 1 durcies sur tous les patterns récurrents.
- Threading résilient même sans `conversationId` Graph.
- Tous les rejets sont tracés (audit complet).
- 180 emails LLM en erreur ont été repassés via `retry-llm-from-info`.

### Tenant — un seul restaurant actif

- `cmoecboxx` (Le Robin) — survivant de la consolidation
- Mailbox `info@le-robin.fr` connectée et active (webhook direct)
- Configuration IA (personnalisation, règles, crédits) en place

### SSO — auto-attach déployé

- Schema `allowedDomains` en prod (commit `96ab127`).
- Logique d'auto-attach déployée en prod (commit `d38d182`, push effectué vers `origin/main`).
- Suite de tests verte (118 tests passants).
- **Manque** : exécuter le seed `scripts/seed-allowed-domains.ts --execute` pour que les 2 domaines de Le Robin matchent effectivement.

---

## Reste à faire

### Action immédiate

1. **Lancer le seed des allowedDomains de cmoecboxx**
   ```bash
   npx tsx scripts/seed-allowed-domains.ts            # dry-run pour vérifier
   npx tsx scripts/seed-allowed-domains.ts --execute  # appliquer
   ```
   Puis valider la vérification post-ÉTAPE 4 :
   - Reconnexion `info@le-robin.fr` → arrive sur cmoecboxx avec config IA visible.
   - (Optionnel) Reconnexion `lucia@lerobin78.onmicrosoft.com` → arrive sur cmoecboxx en tant qu'`ADMIN` existant (sa membership a été créée à l'étape 2), pas de nouveau restaurant.

### Bugs bénins / chantiers techniques restants

2. **Bouton "Se déconnecter" dans l'UI**
   Aujourd'hui, pour passer d'un compte à un autre il faut vider les cookies à la main. Ajouter un menu utilisateur dans la sidebar avec un bouton qui appelle `signOut()` de NextAuth.

3. **Drift Prisma migrations vs schema** _(priorité moyenne — déjà dans `TODO.md`)_
   Le projet utilise `prisma db push` à cause d'un drift historique entre les 2 migrations existantes et le schema actuel. À terme : créer une migration baseline qui capture l'état courant, puis reprendre `prisma migrate dev` pour avoir un historique versionné. Bloquant uniquement si on doit onboarder un collaborateur ou monter un pipeline CI/CD avec migrations automatiques.

4. **Migration LLM Anthropic → OpenAI** _(à évaluer dans 1-2 mois)_
   Aujourd'hui Haiku 4.5 fait le job sur extraction et drafts. À benchmarker dans quelques mois sur un échantillon représentatif (volume + diversité), pour voir si OpenAI (gpt-5-mini ou équivalent) offre un meilleur ratio qualité/prix sur extraction structurée. **Pas urgent** — le pipeline tourne très bien sur Haiku.

5. **Bug P2002 sur `logRejectedEmail`** _(priorité basse — déjà dans `TODO.md`)_
   Lors d'un re-run de `import-info-history.ts --execute`, les emails déjà loggés génèrent une `UniqueConstraintViolation (P2002)` sur `microsoftGraphId`. L'erreur est silencée mais pollue les logs. Fix simple : remplacer le `create()` de `logRejectedEmail` par un `upsert()` avec `update: {}` (no-op si déjà présent).

### Métier (rappel des sujets non démarrés)

6. **Wizard onboarding "premier vrai utilisateur autre que Le Robin"** — quand un nouveau restaurant arrive via SSO sans match `allowedDomains`, le flow d'onboarding standard prend le relais (formulaire `nom` + `emailGroupes`). À tester de bout-en-bout une fois qu'un restaurant tiers se connecte pour la première fois.

7. **Formulaire public `/reservation`** — déjà routé en middleware comme public mais pas branché à `Demande.create`.

8. **Notifications natives** (push web / email digest quotidien) — désactivées en prod pour l'instant.

---

## Commits couverts par cette phase

```
d38d182 feat(sso): auto-attache l'utilisateur à un restaurant via allowedDomains
1819bd4 Savepoint avant ÉTAPE 2 migration cmo9zkt→cmoecboxx
96ab127 Ajoute legacyReference + allowedDomains au schema Prisma
01c4c6b Renforce filtres couche 1 : patterns expéditeurs auto + domaines prospection
b4915a6 Ajoute endpoint admin retro-log-llm-rejects
8bcff27 fix(pipeline): log systématique LLM rejects + blacklist cachaca.rio + DR-0065
83ea78e fix(email-pipeline): blacklist ledelas.fr + FALLBACK_PARSE_ERROR → false + bump retry limit 500
095188f Ajoute endpoint admin retry-llm-from-info pour récupérer les 180 emails LLM en erreur
f42df66 feat(email-filter): blacklist senders ACMS/PayPal + prospection phrases B2B
5bddc60 chore: nettoie données de test jimmy@gmail + blacklist sender dans pipeline
459e330 fix(email-pipeline): fallback threading sur inReplyTo et references RFC 2822
5be6a4e Ajoute endpoint admin retry-llm-pending pour re-traiter emails LLM en erreur
```
