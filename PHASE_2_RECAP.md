# Phase 2 — Résultats réels (2026-04-28)

## Statut final

| # | Item | Statut |
|---|---|---|
| 1 | Page serveur `/config/configuration-ia` | ✅ OUI |
| 2 | Composant `AIConfigurationClient` (racine) | ✅ OUI |
| 3 | Wizard 5 étapes (EspacesClient + MenusClient + AIPersonalizationClient intégrés) | ✅ OUI |
| 4 | Overview post-setup (cartes espaces/menus, style, règles) | ✅ OUI |
| 5 | Drawer "Re-analyser" inline (pas de reset wizardStep/setupCompleted) | ✅ OUI |
| 6 | Credit gate Promise-based (confirm + insufficient) | ✅ OUI |
| 7 | Sidebar remplacée : 2 entrées → 1 "Configuration IA" | ✅ OUI |
| 8 | AIPersonalizationClient : props `onBeforeAnalyze` + `onAnalysisComplete` ajoutés | ✅ OUI |
| 9 | npm run build 0 erreur, 58 routes | ✅ OUI |

---

## Fichiers créés / modifiés

### Créés
- `src/app/(app)/config/configuration-ia/page.tsx` — Server component admin-only, fetche AIConfiguration + Espaces + Menus + OutlookMailboxes + AIPersonalization, rend `AIConfigurationClient`
- `src/components/config/ai-configuration-client.tsx` — Client component (~500 lignes), contient :
  - `AIConfigurationClient` (racine) : bascule Wizard ↔ Overview selon `setupCompleted`
  - `Wizard` : 5 étapes + persistance `wizardStep` via PUT
  - `Overview` : 3 cartes + modals + drawer re-analyse

### Modifiés
- `src/components/config/ai-personalization-client.tsx` — Ajout de 2 props optionnelles :
  - `onBeforeAnalyze?: () => Promise<boolean>` — credit gate avant appel Sonnet
  - `onAnalysisComplete?: (personalization: AIPersonalizationData) => void` — callback post-analyse pour PUT wizard
- `src/components/layout/sidebar.tsx` — Remplacement de `regles-ia` + `ia-personnalisee` par `configuration-ia`

---

## Architecture du Wizard

### Étape 1 — Espaces
- Embarque `EspacesClient` tel quel (safe car il n'utilise que `router.refresh()`)
- Bouton "Suivant" disabled si `espaces.length === 0`
- PUT `wizardStep: 2` à la navigation

### Étape 2 — Offre & Conditions
- Champs : vin/bouteille, menu enfant, heures supp (en euros, stockés ×100 en centimes)
- Acompte : checkbox + % (0-100)
- Conditions d'annulation : textarea libre
- PUT supplements + acompte + cancellationConditions + wizardStep: 3

### Étape 3 — Style d'écriture
- Si `hasExistingStyle && !showReanalyze` : card "déjà configuré" + bouton "Passer"
- Sinon : AIPersonalizationClient embarqué avec credit gate
- `onAnalysisComplete` → PUT styleRules + styleMetadata + wizardStep: 4
- Bouton "Passer cette étape" → PUT wizardStep: 4 (style vide = standard)

### Étape 4 — Révision du prompt
- GET fresh compiledPrompt depuis `/api/admin/ai-configuration` après étape 3
- Zone lecture seule pour `compiledPrompt` (avec warning)
- Zone `customRules` éditable (appended en fin de prompt)
- PUT customRules + wizardStep: 5

### Étape 5 — Récapitulatif
- Affiche : nb espaces, nb menus actifs, threads analysés (ou "standard"), règles perso (oui/non)
- Bouton "Terminer" → PUT setupCompleted: true → bascule vers Overview

---

## Architecture de l'Overview

### Carte 1 — Espaces & Menus
- Compte + aperçu noms
- Liens directs vers `/config/espaces` et `/config/menus`

### Carte 2 — Style d'écriture
- threadsAnalyzed + mailbox source
- Aperçu styleRules (280 chars, tronqué)
- Édition inline + modal "Voir le détail"
- Drawer "Re-analyser" : panel fixe droit (maxWidth 860px), AIPersonalizationClient complet avec credit gate
  - Pas de reset setupCompleted ni wizardStep

### Carte 3 — Règles supplémentaires
- Aperçu customRules (200 chars)
- Édition inline (PUT customRules)

### Footer
- "Voir le prompt complet" (modal)
- Lien vers `/credits`
- Bouton "Réinitialiser" → confirm → DELETE /api/admin/ai-configuration → retour wizard

---

## Patterns techniques retenus

### Credit gate (Promise-based)
```ts
const creditGateResolve = useRef<((v: boolean) => void) | null>(null)

const onBeforeAnalyze = async (): Promise<boolean> => {
  const r = await fetch('/api/admin/ai-credits')
  const data = await r.json() as { balance?: number }
  setCreditGate((data.balance ?? 0) < 1 ? 'insufficient' : 'confirm')
  return new Promise(resolve => { creditGateResolve.current = resolve })
}
```

### putConfig helper
```ts
async function putConfig(data: Record<string, unknown>) {
  return fetch('/api/admin/ai-configuration', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
```

### Persistance wizardStep
Chaque navigation appelle `putConfig({ wizardStep: N })` avant de changer l'état local — permet de reprendre au bon endroit si l'utilisateur quitte et revient.

---

## Résultat du build

```
✓ Compiled successfully in 3.3s
✓ Generating static pages (58/58)
0 erreur TypeScript, 0 erreur de build
```

Route `/config/configuration-ia` présente dans le manifest.

---

## Cleanup prévu Phase 3

- Supprimer pages `/config/regles-ia` et `/config/ia-personnalisee` (gardées pour rollback, plus accessibles depuis le sidebar)
- Cleanup dans `ai-draft/route.ts` quand tous restaurants ont `setupCompleted=true` (voir PHASE_1_RECAP.md §Cleanup prévu Phase 3)
