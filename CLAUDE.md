# CLAUDE.md — Instructions pour Claude Code

> Ce fichier est lu automatiquement par Claude Code au début de chaque session.
> Il définit le contexte du projet et les règles de collaboration.

---

## 1. Qui je suis

Je m'appelle Jimmy, je suis gérant du restaurant **Le Robin** (France) avec mes associés Lucia et Paul. Robin-v2 est un projet **que je développe et maintiens seul**. Je suis techniquement à l'aise (iOS/SwiftUI, web HTML/JS, networking) mais je ne suis pas développeur full-time : mon temps est limité, et chaque feature ajoutée doit rester **maintenable par moi seul** dans 6 mois.

---

## 2. Ce qu'est Robin-v2

SaaS multi-restaurant de gestion des demandes événementielles (privatisations, mariages, séminaires…). Le restaurant reçoit des emails clients, Robin centralise, l'IA propose des brouillons de réponse, l'utilisateur valide et envoie.

### Stack
- **Framework** : Next.js 16 / React 19 — App Router
- **DB** : PostgreSQL + Prisma (multi-tenant par `restaurantId`)
- **Auth** : NextAuth v5 — SSO Microsoft Azure AD
- **Email** : Microsoft Graph API (webhooks + cron fallback)
- **IA** : Anthropic Claude (Haiku pour extraction/draft, Sonnet pour analyses lourdes)
- **Hébergement** : Vercel

### Modèle de données central
```
Restaurant → OutlookMailbox / Espace / Menu / User+Membership / Demande
Demande → Contact / Thread → Message / PieceJointe
```

### Cycle d'une demande
`NOUVELLE → EN_COURS → ATTENTE_CLIENT → CONFIRMEE / ANNULEE / PERDUE`

---

## 3. Comment je veux qu'on collabore

### Règle d'or : cadrer avant de coder

**Avant tout changement non-trivial** (nouvelle feature, nouveau modèle DB, refonte d'un module, ajout de dépendance, modification du schema Prisma), tu DOIS :

1. Me poser **3 à 5 questions de cadrage** pour comprendre le besoin réel derrière la demande
2. Me proposer **2 à 3 approches différentes** avec leurs trade-offs (effort, complexité, risque, maintenance)
3. Me **recommander l'approche la plus adaptée à mes contraintes** (voir section 4)
4. **Attendre ma validation explicite** avant d'écrire la moindre ligne de code

Si je te dis "fais X", interroge-toi d'abord : *est-ce que X est la solution, ou est-ce que c'est une solution que Jimmy imagine pour résoudre un problème plus profond ?* Si c'est le second cas, challenge-moi. Mieux vaut me faire reformuler que coder la mauvaise chose.

### Pour les changements triviaux

Tu peux y aller directement, sans cadrage préalable :
- Corriger un bug localisé
- Ajuster une couleur, un padding, un libellé
- Refactor local d'une fonction
- Ajouter un log, un commentaire
- Renommer une variable

En cas de doute sur le caractère trivial : **demande**.

### Avant un changement risqué

- **Toujours commit avant** (`git add -A && git commit -m "savepoint avant <description>"`) pour permettre un revert facile
- Annonce-moi clairement le risque : *"Cette modif touche le schema Prisma, je commit d'abord"*

### Ne jamais faire sans me demander

- Ajouter une dépendance npm
- Modifier un fichier de config racine (`next.config.js`, `tsconfig.json`, `prisma/schema.prisma` pour autre chose qu'un ajout simple)
- Toucher au système d'auth (`src/auth.ts`, NextAuth, sessions, JWT)
- Modifier les variables d'environnement attendues
- Lancer `prisma migrate reset` ou tout ce qui drop des données
- Push sur la branche `main` directement (toujours via PR ou demande explicite)

---

## 4. Mes contraintes business (à respecter en permanence)

1. **Simplicité d'abord** : si tu hésites entre simple-mais-pragmatique et propre-mais-complexe, propose-moi les deux. Par défaut je choisirai le simple.

2. **Zéro effort manuel récurrent dans les features** : si une feature demande à un utilisateur (moi ou un employé) de cliquer/valider/curer régulièrement, c'est un mauvais design. L'automatisation est non négociable.

3. **Lisibilité > élégance** : un code que je relis dans 6 mois et que je comprends en 30 secondes vaut mieux qu'un code "élégant" qui demande de remonter 4 niveaux d'abstraction.

4. **Pas de feature creep** : si je te demande A, fais A. Pas A + B + C "tant qu'on y est". Si tu vois B et C utiles, **liste-les en fin de réponse comme suggestions**, ne les implémente pas.

5. **Respecter le multi-tenant** : tout query DB doit être scopé par `restaurantId`. Toujours. Si un endpoint admin transverse est nécessaire, signale-le explicitement.

6. **Coût IA** : Claude Haiku par défaut pour les appels en boucle (drafts, classifications). Sonnet uniquement pour les analyses lourdes one-shot. Ne jamais boucler sur Sonnet sans m'avertir.

---

## 5. Conventions du projet

### Structure
- `src/app/` — App Router (routes + API)
- `src/app/(app)/` — pages authentifiées
- `src/app/api/` — endpoints API
- `src/components/` — composants React
- `src/lib/` — logique métier réutilisable
- `prisma/schema.prisma` — schema DB

### Style de code
- TypeScript strict
- Pas de `any` sans commentaire justifiant
- Préférer les fonctions pures dans `src/lib/`
- Les routes API retournent toujours `NextResponse.json(...)` avec un statut HTTP correct

### Tests
- Pas de framework de tests automatisés actuellement
- Test = je teste à la main en dev
- Si tu écris du code complexe, propose un script de test manuel reproductible (curl, étapes UI…)

### Commits
- Messages en français, courts, à l'impératif : `Ajoute filtre par type sur /demandes`
- Pas de "fix typo" en série, regroupe

---

## 6. Pièges connus / contexte d'historique

- **Pennylane API** : utilisée pour l'analytics financier d'un autre projet (`dashboard.le-robin.fr`), pas pour Robin-v2. Ne pas confondre.
- **Multi-tenant strict** : déjà eu des bugs où une query oubliait le `where: { restaurantId }`. Vigilance.
- **Microsoft Graph permissions** : certaines opérations demandent des permissions Azure AD spécifiques (ex : `MailboxSettings.ReadWrite` pour modifier des dossiers/règles). Vérifie le scope avant de coder.
- **Vercel cron** : limites de durée d'exécution sur le plan actuel. Tout traitement long doit être splittable ou async.

---

## 7. Ce que tu ne sais pas et que tu dois me demander

Au début d'une session, si tu n'es pas sûr :
- L'état actuel d'une feature (en prod ? en dev ? désactivée ?)
- Quelle mailbox est en prod (`info@le-robin.fr` est la principale)
- Quel restaurant est en environnement de test
- Si une migration a été appliquée en prod ou pas

**Demande, ne devine pas.**

---

## 8. Format de tes réponses

- **Concis par défaut**. Pas de préambule du type "Bien sûr, je vais faire ça…"
- Quand tu modifies plusieurs fichiers, **résume les changements en fin de réponse** sous forme de liste : `- src/lib/x.ts : ajout fonction Y`
- Si tu détectes une incohérence dans ce que je demande vs ce que le code fait, **signale-le avant de coder**.
- Si tu te trompes ou que tu identifies un bug que tu as introduit dans une session précédente, **dis-le clairement**, pas de déni ni d'auto-justification.

---

## 9. Phrase magique

Si jamais je te dis **"on cadre"**, ça veut dire : *stop, on arrête de coder, on revient à la section 3 règle d'or, tu poses des questions et tu proposes des approches.*

Si je te dis **"fonce"**, ça veut dire : *j'ai validé l'approche, exécute sans plus me redemander.*
