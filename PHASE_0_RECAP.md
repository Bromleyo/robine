# Phase 0 — Système de crédits IA

## Ce qui a été fait

### Prisma (schema + db push)
- Enum `AICreditTransactionType` : `GIFT | PURCHASE | CONSUME | REFUND`
- Model `AICredits` : un par restaurant (`restaurantId @unique`), champ `balance Int`
- Model `AICreditTransaction` : historique de chaque mouvement
- Relations ajoutées sur `Restaurant`

### Endpoints API (`/api/admin/ai-credits`)
| Route | Méthode | Description |
|---|---|---|
| `/api/admin/ai-credits` | GET | Retourne `{ balance }`. Upsert auto si absent (balance=1). |
| `/api/admin/ai-credits/consume` | POST | Décrémente balance de 1 dans une transaction atomique. 402 si balance < 1. |
| `/api/admin/ai-credits/purchase` | POST | Incrémente balance de `quantity` (1–10). **Bloqué en prod** sans `STRIPE_ENABLED`. |

### Onboarding
- À la création d'un restaurant : `AICredits` créé avec `balance=1` + transaction `GIFT` "Crédit de bienvenue", dans la même `prisma.$transaction`.

### UI
- `src/components/credits/credit-badge.tsx` — badge client dans la sidebar, affiche le solde, lien vers `/credits`. Orange si solde = 0.
- `src/components/credits/purchase-button.tsx` — bouton client POST /purchase, reload après succès.
- `src/app/(app)/credits/page.tsx` — page admin : solde + historique des 50 dernières transactions.

---

## Utilisation dans le flow IA

Avant de lancer une analyse Sonnet (ex: dans `ai-personalization-client.tsx`), appeler :

```ts
const res = await fetch('/api/admin/ai-credits/consume', { method: 'POST' })
if (res.status === 402) {
  // Afficher modal "Crédits insuffisants — rendez-vous sur /credits"
  return
}
// Lancer l'analyse
```

---

## Avant la mise en prod

- L'endpoint `/api/admin/ai-credits/purchase` est **désactivé en production par défaut**
- Il retourne 403 tant que `STRIPE_ENABLED` n'est pas défini dans les variables d'environnement
- À activer uniquement quand l'intégration Stripe sera en place
- Variable à ajouter dans Vercel : `STRIPE_ENABLED=true`

---

## Prochaine étape : Phase 1

Intégrer le gate crédits dans `ai-personalization-client.tsx` avant l'appel Sonnet.
