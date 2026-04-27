# Prompt à donner à Claude Code — Étape 2 : Construction de l'extracteur de règles IA

> Copie-colle l'intégralité de ce qui suit dans Claude Code.

---

## Contexte

Le rollback du système RAG est fait, propre, déployé. On change complètement d'approche.

**Ancienne approche (abandonnée)** : RAG permanent qui réinjecte des exemples à chaque génération de brouillon.

**Nouvelle approche (one-shot, à construire)** : analyser une fois pour toutes ~250 vrais threads d'emails événementiels du restaurant, en faire une analyse profonde par Claude Sonnet 4.5, et produire un document Markdown de **règles écrites** (ton, formules, structure des réponses, processus de qualification, gestion des objections). Ce document sera ensuite injecté manuellement dans la feature "Règles IA" déjà existante. Aucun stockage long terme d'exemples. Aucune réinjection à chaque génération. Tout se passe une seule fois.

## Architecture cible

Un flux en 4 étapes côté UI :

```
1. Filtrage Outlook (mots-clés)         → ~250 threads candidats
2. UI : tableau de validation humaine    → tu décoches les faux positifs
3. Bouton "Analyser X conversations"     → Sonnet 4.5 analyse le corpus
4. Document Markdown affiché             → tu le copies dans /config/regles-ia
```

## Contraintes

- **Zéro effort manuel récurrent** : ce flow se lance une fois, on ne revient pas dessus
- **Aucun stockage permanent des threads/messages** : la sélection peut être stockée temporairement pour permettre la reprise (voir bonus 4), mais pas comme source de vérité
- **Multi-tenant strict** : tout est scopé par `restaurantId`
- **Page accessible uniquement aux ADMIN**
- **Coût IA acceptable** : ~5€ pour le run Sonnet 4.5, validé

## Tâches

### 1. Créer la page admin

**Route** : `/config/regles-ia/extraction` (sous-page de la feature Règles IA existante)
**Composant** : `src/components/config/rules-extraction-client.tsx`
**Page** : `src/app/(app)/config/regles-ia/extraction/page.tsx`
**Sidebar** : ajouter le sous-lien dans `src/components/layout/sidebar.tsx` sous "Règles IA"
**Protection** : `requireRole(session.user.role, 'ADMIN')`

L'UI a 3 états :
- **État A — Initial** : un grand bouton central "Lancer l'extraction" + texte explicatif (3-4 lignes max)
- **État B — Validation** : tableau interactif de threads à filtrer (voir détails ci-dessous)
- **État C — Résultat** : document Markdown affiché dans une zone scrollable + bouton "Copier dans le presse-papier"

### 2. Endpoint d'extraction des threads candidats

**Route** : `POST /api/admin/rules-extraction/fetch-threads`
**Auth** : ADMIN, `restaurantId` du JWT
**Body** : `{ mailboxId: string }` — une seule mailbox par run (Jimmy va commencer par `info@le-robin.fr`)

**Logique** :

a) Récupère la mailbox correspondante et son token Microsoft Graph (déchiffre comme dans le code existant)

b) Construit la requête Graph API avec :
- **Mailbox** : la mailbox sélectionnée
- **Période** : 12 derniers mois
- **Filtre $search** côté Graph API sur les mots-clés suivants dans le sujet (utilise l'opérateur OR de $search). Liste exacte :

```
"privatisation" OR "privatiser" OR "mariage" OR "noces" OR "séminaire" OR 
"seminaire" OR "cocktail" OR "anniversaire" OR "baptême" OR "bapteme" OR 
"communion" OR "pot de départ" OR "pot de depart" OR "pot d'entreprise" OR 
"enterrement" OR "groupe" OR "événement" OR "evenement" OR "devis" OR 
"réception" OR "reception" OR "salle privée" OR "salon privé" OR 
"terrasse privée" OR "repas d'entreprise" OR "convives" OR "couverts" OR 
"nombre de personnes"
```

c) Pagine via Graph API jusqu'à atteindre toute la période (gère le `@odata.nextLink`)

d) **Pré-filtrage automatique** : rejette les messages dont l'expéditeur match :
- `noreply@`, `no-reply@`, `newsletter@`, `marketing@`, `notification@`, `donotreply@`, `mailer-daemon@`, `postmaster@`

e) **Groupe par `conversationId`** pour reconstituer les threads

f) Pour chaque thread, calcule :
- `subject` : sujet du premier message
- `senderEmail` : expéditeur du premier message entrant
- `firstMessageDate` : date du premier message
- `messageCount` : nombre total de messages
- `hasReplyFromUs` : true si au moins un message a été envoyé depuis l'adresse de la mailbox (filtre les threads sans réponse du restaurant — pas pertinents pour apprendre le style)
- `firstMessagePreview` : 250 premiers caractères du body texte du premier message entrant (HTML stripped)

g) **Filtre final** : ne garder que les threads avec `messageCount >= 3` et `hasReplyFromUs = true`

h) **Tri par défaut** : `messageCount` décroissant (les threads longs en haut, plus pertinents)

i) Retourne un JSON :
```json
{
  "threads": [
    {
      "conversationId": "...",
      "subject": "...",
      "senderEmail": "...",
      "firstMessageDate": "2025-03-12T...",
      "messageCount": 6,
      "firstMessagePreview": "Bonjour, je souhaiterais..."
    }
  ],
  "totalFetched": 412,
  "afterAutoFilter": 287
}
```

⚠️ **Performance** : si Vercel timeout sur la durée d'exécution, splitte la pagination en plusieurs appels (l'UI peut afficher un loader et appeler successivement). Mais idéalement, gère ça en un seul appel avec un timeout généreux.

### 3. UI de validation (tableau)

Dans le composant `rules-extraction-client.tsx`, après l'appel `fetch-threads` :

**Tableau** avec colonnes :
| ☑ | Sujet | Expéditeur | Date | Nb msg | Aperçu |

**Comportement** :
- Tout coché par défaut
- Tri par défaut : nombre de messages décroissant (déjà fait côté API, juste respecter l'ordre)
- Boutons en haut : "Tout cocher" / "Tout décocher"
- Compteur dynamique en bas : "**X conversations sélectionnées sur Y**"
- Bouton principal en bas (sticky) : **"Analyser les X conversations sélectionnées"** (désactivé si X = 0)
- Aperçu : tronqué visuellement à ~120 caractères dans le tableau, bulle au hover qui montre les 250 caractères complets

**Sauvegarde de la sélection** :
- À chaque check/uncheck, persister dans `localStorage` la liste des `conversationId` décochés (clé `rules-extraction-deselected-{mailboxId}`)
- Au chargement de la page, restaurer cet état si présent

### 4. Endpoint d'analyse Sonnet

**Route** : `POST /api/admin/rules-extraction/analyze`
**Auth** : ADMIN
**Body** : `{ mailboxId: string, conversationIds: string[] }`

**Logique** :

a) Re-fetch chaque thread complet via Graph API (avec tous les messages : `from`, `to`, `body` HTML stripped, `sentDateTime`)

b) Formate chaque thread en texte structuré :
```
=== Thread 1/X — Sujet : "..." ===
[2025-03-12 14:32] CLIENT (marie@xxx.fr) :
Bonjour, je souhaiterais...

[2025-03-12 16:08] RESTAURANT (info@le-robin.fr) :
Bonjour Marie, merci pour votre demande...

[2025-03-13 10:15] CLIENT :
...
```

c) Construit le prompt système et user pour Claude Sonnet 4.5 :

**System prompt** :
```
Tu es un expert en analyse conversationnelle, spécialisé dans le secteur 
de la restauration événementielle. Tu vas analyser un corpus de vrais 
échanges email entre un restaurant et ses clients qui font des demandes 
d'événements (privatisations, mariages, séminaires, anniversaires, etc.).

Ton objectif : produire un document de RÈGLES écrites en français qui, 
injecté dans le prompt système d'une autre IA, lui permettra de répondre 
aux nouvelles demandes EXACTEMENT comme le restaurant le ferait — même 
ton, même structure, mêmes formules, même processus de qualification.

Le document doit être:
- Concret et actionnable (pas de généralités)
- Riche en exemples textuels précis (formules récurrentes, expressions 
  typiques, mots-clés du restaurant)
- Structuré en sections claires
- Rédigé pour qu'un autre Claude puisse l'appliquer directement
```

**User prompt** :
```
Voici {N} threads de conversations entre un restaurant français et ses 
clients sur des demandes d'événements.

[INSÉRER LES THREADS FORMATÉS]

Analyse ce corpus et produis un document Markdown structuré avec les 
sections suivantes :

## 1. Ton et registre
Comment le restaurant s'adresse-t-il aux clients ? Tutoiement/vouvoiement ? 
Niveau de formalité ? Chaleur, distance, etc. Donne 3-5 exemples 
textuels précis tirés du corpus.

## 2. Structure type d'une réponse à une nouvelle demande
Quel est le squelette type d'une première réponse ? (accroche → 
remerciement → questions de qualification → présentation des options → 
appel à l'action). Décris-le précisément.

## 3. Questions de qualification systématiques
Quelles sont les informations que le restaurant cherche TOUJOURS à 
obtenir avant de proposer un devis ? (date, nombre de convives, type 
d'événement, budget, contraintes alimentaires, etc.) Liste-les par 
ordre de priorité.

## 4. Formules récurrentes
Liste les phrases types réutilisées (ouverture, transition, conclusion, 
remerciement). Cite-les telles qu'écrites dans le corpus.

## 5. Gestion des prix et devis
Comment le restaurant aborde-t-il les prix ? Communique-t-il un budget 
indicatif d'emblée ? Renvoie-t-il vers un menu PDF ? Propose-t-il 
plusieurs formules ? Comment justifie-t-il les tarifs ?

## 6. Gestion des objections et négociations
Comment réagit le restaurant face à : un client qui trouve cher, qui 
demande une remise, qui hésite, qui demande des modifs au menu, qui 
a une contrainte forte (allergie, religion, budget) ?

## 7. Espaces et capacités
Quelles informations le restaurant donne-t-il sur ses espaces (La Cave, 
Le Salon, etc.) ? Comment les présente-t-il ? Quelles capacités sont 
mentionnées ?

## 8. Suivi et relances
Comment et quand le restaurant relance-t-il un client qui ne répond pas ? 
Quelles formules utilise-t-il ?

## 9. Particularités et signaux culturels
Tout ce qui rend le style unique au restaurant et qui doit être préservé : 
expressions régionales, références au lieu, personnalisation, humour, 
ouverture à la flexibilité, etc.

## 10. Anti-patterns à éviter
Y a-t-il des choses que le restaurant ne fait JAMAIS dans ses réponses ? 
(ex: ne jamais commencer par "Bonjour"', toujours signer du prénom, ne 
jamais donner un prix par téléphone, etc.)

Sois exhaustif et factuel. Cite des extraits réels du corpus pour 
illustrer chaque règle. Le document doit faire entre 1500 et 4000 mots.
```

d) Appel à l'API Anthropic avec :
- Modèle : `claude-sonnet-4-5-20250929` (vérifier le nom exact actuellement supporté)
- Max tokens output : 8000
- Temperature : 0.3 (factuel, peu créatif)

e) Retourne `{ markdown: string, threadsAnalyzed: number, tokensUsed: { input, output } }`

⚠️ **Gestion taille de contexte** :
Si le corpus dépasse 150 000 tokens en input, **splitte automatiquement** en 2-3 batchs :
- Batch 1 : analyse les threads 1 à N/2 → produit un draft
- Batch 2 : analyse les threads N/2 à N → produit un draft
- Batch final : "Voici deux analyses partielles, fusionne-les en un document unifié et cohérent qui suit la structure des 10 sections."

### 5. UI État C — Résultat

Affiche le markdown rendu dans la page (pas de download, c'est sur écran).
Bouton "Copier le markdown brut" qui copie le markdown source (pas le rendu) dans le presse-papier.
Texte explicatif : "Copie ce document et colle-le dans /config/regles-ia. Tu peux l'éditer pour l'ajuster avant de le sauvegarder."

### 6. Aucune persistance DB nouvelle

**N'ajoute aucun nouveau modèle Prisma.** Tout vit en mémoire pendant le run + localStorage pour la sélection. Les threads ne sont jamais écrits en base. Le markdown produit n'est pas sauvegardé en base (Jimmy le copie/colle manuellement dans la feature Règles IA).

## Contraintes techniques

- TypeScript strict, pas de `any` sans commentaire
- Toutes les routes API retournent `NextResponse.json()` avec status HTTP correct
- Pas de nouvelle dépendance npm — utilise uniquement ce qui est déjà installé
- Variables d'env requises : confirme que `ANTHROPIC_API_KEY` est bien présente, sinon documente clairement ce qui manque
- Multi-tenant : tout query DB scope par `restaurantId` du JWT

## Avant de coder

1. Confirme que tu as compris l'architecture (3 endpoints + 1 page + 1 composant client)
2. Liste les fichiers que tu vas créer/modifier
3. Pose-moi 2-3 questions si quelque chose n'est pas clair (gestion d'erreur Graph API, format exact attendu, etc.)
4. Attends ma validation avant d'écrire du code

## Après avoir codé

1. Vérifie que `npm run build` passe sans erreur
2. Commit avec un message clair : `feat(rules-extraction): page admin one-shot d'extraction de règles IA`
3. Fais-moi un récap des fichiers créés/modifiés
4. Liste les points qui pourraient nécessiter un test manuel de ma part avant déploiement
