# Bascule de la subscription Graph : info@ → event@

## Contexte

Le SaaS Robin v2 est actuellement abonné à `info@le-robin.fr` via 
Microsoft Graph. On a décidé de basculer vers `event@le-robin.fr` 
(boîte partagée dédiée aux demandes événementielles).

Une règle de flux Exchange côté admin M365 copie automatiquement en 
Cci vers `event@` tous les mails reçus sur `info@` contenant des 
mots-clés événementiels. Donc à partir de maintenant, `event@` est 
la source unique du SaaS.

`info@` ne doit **plus** être lu par le SaaS : les mails non 
événementiels reçus sur `info@` doivent continuer à être gérés par 
l'équipe en direct via Outlook, sans passer par le CRM.

## Objectifs de la PR

1. Désactiver la subscription Graph sur `info@le-robin.fr` proprement 
   (DELETE côté Graph API + toggle actif=false en base).
2. Créer une nouvelle subscription Graph sur `event@le-robin.fr`.
3. S'assurer que la table `outlook_mailboxes` reflète la réalité : 
   `event@` actif = true, `info@` actif = false.
4. Ne PAS supprimer les données historiques : les demandes/threads/
   messages déjà créés depuis `info@` restent en base et accessibles.

## Étapes d'implémentation

### 1. Diagnostic de l'état actuel

Commence par lire la table `outlook_mailboxes` et dis-moi :
- Combien de mailboxes sont présentes
- Pour chacune : email, actif, subscriptionId, subscriptionExpiry
- Lesquelles ont une subscription Graph encore valide

```typescript
// Exemple de requête à exécuter
const mailboxes = await prisma.outlookMailbox.findMany({
  select: { 
    id: true, 
    email: true, 
    actif: true, 
    subscriptionId: true, 
    subscriptionExpiry: true,
    restaurantId: true 
  }
});
console.log(JSON.stringify(mailboxes, null, 2));
```

**Ne fais rien d'autre tant que je n'ai pas vu ce diagnostic.** Je 
veux valider ce qu'il y a en base avant qu'on touche à quoi que ce 
soit.

### 2. Vérification côté Graph API

Pour chaque mailbox qui a un `subscriptionId`, vérifie auprès de 
Graph si la subscription existe toujours :

```
GET https://graph.microsoft.com/v1.0/subscriptions/{subscriptionId}
```

Liste les subscriptions retrouvées vs orphelines (présentes en base 
mais plus en Graph, ou l'inverse).

### 3. Plan de bascule (à valider avant exécution)

Rédige un plan d'action textuel qui détaille :
- Quelles subscriptions Graph vont être supprimées
- Quelles subscriptions Graph vont être créées
- Quelles lignes de `outlook_mailboxes` vont être modifiées (insert 
  ou update)
- Ce qui se passe pour les `threads` / `messages` / `demandes` déjà 
  liés à `info@`

**STOP ici. Affiche-moi ce plan et attends ma validation avant 
d'exécuter.**

### 4. Exécution

Une fois le plan validé, exécute dans cet ordre :

**a) Ajouter `event@le-robin.fr` dans la table si absente**

Si `event@le-robin.fr` n'est pas déjà dans `outlook_mailboxes` pour 
le restaurant Le Robin, l'insérer :

```typescript
await prisma.outlookMailbox.create({
  data: {
    restaurantId: '<id du restaurant Le Robin>',
    email: 'event@le-robin.fr',
    displayName: 'Événements Le Robin',
    actif: false, // on l'active après création de la subscription
    // msAccessToken / msRefreshToken : NULL 
    // (on utilise auth applicative, pas OAuth utilisateur)
  }
});
```

**Important :** `event@le-robin.fr` est une **boîte partagée**, pas 
un utilisateur qui se connecte via OAuth. La subscription Graph 
doit être créée avec un **token applicatif** (client credentials 
flow), pas un token utilisateur délégué.

Vérifie dans `src/lib/graph/auth.ts` que le mode d'auth utilisé 
supporte ce cas. Si le code actuel utilise uniquement des tokens 
utilisateur (OAuth delegated), il faudra ajouter un mode 
"application" — mais commence par vérifier avant de modifier.

**b) Créer la subscription Graph sur event@**

```typescript
POST https://graph.microsoft.com/v1.0/subscriptions
{
  "changeType": "created",
  "notificationUrl": process.env.MS_GRAPH_WEBHOOK_URL,
  "resource": "users/event@le-robin.fr/mailFolders/inbox/messages",
  "expirationDateTime": "<maintenant + 70h en ISO>",
  "clientState": process.env.MS_GRAPH_WEBHOOK_SECRET
}
```

Récupérer le `subscriptionId` retourné, le stocker dans 
`outlook_mailboxes.subscriptionId`, passer `actif = true`.

**c) Désactiver l'ancienne mailbox info@**

```typescript
// 1. Supprimer la subscription Graph
await graphClient.api(`/subscriptions/${infoMailbox.subscriptionId}`)
  .delete();

// 2. Mettre à jour la DB
await prisma.outlookMailbox.update({
  where: { id: infoMailbox.id },
  data: { 
    actif: false,
    subscriptionId: null,
    subscriptionExpiry: null,
  }
});
```

**d) Vérification post-bascule**

- Lister les subscriptions Graph actives : 
  `GET /subscriptions` → doit contenir event@, doit PAS contenir info@
- Lire `outlook_mailboxes` : event@ actif=true avec subscriptionId, 
  info@ actif=false sans subscriptionId

### 5. Tests manuels à faire ensuite (par Jimmy)

Une fois la bascule faite, Jimmy enverra un mail test depuis un 
Gmail externe vers `event@le-robin.fr` directement. On vérifiera :
- Webhook reçu sur `/api/webhooks/graph`
- Message stocké dans `messages`
- Demande créée dans `demandes` (si le LLM détecte une demande 
  événementielle)

## Points d'attention

### Auth application vs delegated

Microsoft Graph supporte deux modes pour accéder aux boîtes mail :

- **Delegated** : token OAuth d'un utilisateur humain, l'app agit 
  "au nom de" cet utilisateur, ne peut lire que les boîtes auxquelles 
  cet utilisateur a accès.
  
- **Application** : token obtenu via client_credentials (app seule, 
  pas d'utilisateur), nécessite les permissions Azure en mode 
  "Application", peut accéder à n'importe quelle boîte du tenant 
  (SAUF si restreint via ApplicationAccessPolicy).

Pour une boîte partagée qui ne se connecte pas en OAuth, **le mode 
Application est obligatoire**. Vérifie dans Azure Portal que l'app 
a bien `Mail.Read` et `Mail.ReadWrite` en type **Application** (pas 
uniquement Delegated), et que "Grant admin consent" a été fait.

Si ce n'est pas le cas, prépare un message pour Jimmy listant les 
actions à faire côté Azure, mais ne tente pas de modifier ça toi-même.

### Restriction via ApplicationAccessPolicy

Pour la sécurité, l'idéal est que l'app Azure soit restreinte à 
`event@le-robin.fr` uniquement, pas accès au tenant entier. Cette 
restriction se fait via PowerShell (`New-ApplicationAccessPolicy`), 
côté admin M365.

Si ce n'est pas encore fait, ajoute dans le message à Jimmy un 
rappel de faire cette commande après la bascule (on le fera dans 
une session dédiée).

### Historique

Les `demandes` créées quand `info@` était actif restent en base et 
restent visibles dans le CRM — c'est ce qu'on veut. Aucune 
migration de données à faire.

Par contre, les nouveaux mails qui arriveront sur `info@` après 
bascule ne seront plus ingérés par le SaaS. Ils ne feront plus 
apparaître de nouvelles demandes. C'est le comportement attendu : 
l'équipe les gère en direct via Outlook.

### Renouvellement du cron

Le cron `GET /api/cron/renew-subscriptions` va désormais renouveler 
la subscription event@. Vérifie que son code parcourt bien toutes 
les mailboxes actives de la table et ne cherche pas spécifiquement 
un hardcoded info@ quelque part.

## Ordre d'exécution

1. Diagnostic (section 1) → attends ma validation
2. Vérification Graph (section 2) → attends ma validation
3. Plan de bascule (section 3) → attends ma validation
4. Vérification du mode auth Graph (application vs delegated) → 
   informe-moi si des actions Azure sont nécessaires
5. Exécution (section 4) uniquement après OK sur tout ce qui 
   précède
6. Tu me confirmes la fin et je fais les tests manuels

**Ne fais AUCUNE modification avant d'avoir l'accord explicite à 
chaque étape. Je préfère un aller-retour de trop qu'une bascule ratée.**
