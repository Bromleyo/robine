# PHASE 2 TER — RECAP

## Objectif
Ajout de la logique de calcul automatique des frais de privatisation dans la Configuration IA : seuils de CA par espace et créneau, taux de marge marchandise, injection dans le prompt compilé.

---

## Vérification préalable
- Table `regles_ia` vide pour Le Robin (cmoecboxx000104jls85sji8n) → aucune migration data nécessaire.
- `seuilsCA = {}` initialisé vide, à remplir via l'UI.

---

## Modifications apportées

### 1. Schéma Prisma (`prisma/schema.prisma`)
Ajout sur `model AIConfiguration` :
- `seuilsCA Json @default("{}")` — format : `{ "espaceId": { midiSemaine, soirSemaine, midiWeekend, soirWeekend } }` (valeurs en euros entiers)
- `margeMarchandise Float @default(0.70)` — taux entre 0 et 1 (0.70 = 70%)
- `prisma db push` + `prisma generate` exécutés

### 2. API (`src/app/api/admin/ai-configuration/route.ts`)
- `allowedFields` étendu avec `'seuilsCA'` et `'margeMarchandise'`

### 3. compile.ts (`src/lib/ai-configuration/compile.ts`)
- Nouvelle section `## Frais de privatisation` injectée entre règles administratives et style
- Conditionnelle : n'apparaît que si au moins un espace a un créneau non-zéro dans `seuilsCA`
- Contient : formule de calcul, CA cibles par salle (noms joints via `espaces`), 3 règles importantes (montant net, créneau inconnu, arrondi centaine)

### 4. Page (`src/app/(app)/config/configuration-ia/page.tsx`)
- Ajout de `seuilsCA: true` et `margeMarchandise: true` dans le `select` Prisma
- Mapping du `config` objet enrichi des 2 nouveaux champs

### 5. UI (`src/components/config/ai-configuration-client.tsx`)
- Types `CreneauxCA`, `SeuilsCA`, constantes `EMPTY_CRENEAUX`, `CRENEAUX` ajoutés
- `AIConfigData` interface : +`seuilsCA: SeuilsCA`, +`margeMarchandise: number`
- Composant interne `CaGrid` : grille 4 inputs réutilisée en wizard et en modal
- **Step 1** : section "CA cible par créneau" après EspacesClient — sauvegardée au "Suivant"
- **Step 2** : section "Marge marchandise" (input %, default 70) — sauvegardée au "Suivant"
- **Overview Card 1** : bouton "CA cibles" → modal de saisie par espace
- **Overview Card 2 "Privatisation"** (nouvelle) : input marge % avec sauvegarde automatique au blur
- Modal CA cibles : CaGrid + bouton Enregistrer → PUT + router.refresh()

### 6. Fix préexistant (`src/app/reservation/page.tsx`)
- Ajout de `export const dynamic = 'force-dynamic'` — évite l'échec de prérendering au build sans accès DB

### 7. Script utilitaire (`prisma/migrations/scripts/recompile-robin.ts`)
- Recompile et met à jour `compiledPrompt` pour Le Robin
- Doit être lancé avec DATABASE_URL pré-injectée : `DATABASE_URL="..." npx tsx ...`

### 8. Recompilation
- `compiledPrompt` de Le Robin mis à jour → 25 569 chars
- Section privatisation absente du prompt actuel (normal : `seuilsCA = {}`) — apparaîtra à la première saisie UI

---

## Build
`npm run build` — ✓ Compiled successfully, 0 erreur, 0 warning.

---

## Décisions de cadrage retenues
- Q1 : seuilsCA sauvegardé au "Suivant" de l'étape 1 (comme supplements)
- Q2 : seuilsCA et margeMarchandise éditables hors wizard — bouton "CA cibles" en Card 1 + Card "Privatisation" avec marge inline
- Q3 : format `{ espaceId: { ... } }` (robuste aux renommages) — compile.ts joint les noms via findMany
