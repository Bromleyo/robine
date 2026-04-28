# PHASE 2 BIS — RECAP

## Objectif
Évolution du modèle Menu pour gérer les seuils conditionnels par nombre de personnes (choix unique / choix multiple) et l'upload de PDF par menu. Intégration des pièces jointes dans le flow de réponse IA.

---

## Modifications apportées

### 1. Schéma Prisma (`prisma/schema.prisma`)
- Ajout enum `ServiceType { ASSIS BUFFET COCKTAIL }`
- Ajout sur `model Menu` :
  - `serviceType ServiceType @default(ASSIS)`
  - `choixUniqueDispo Boolean @default(true)`
  - `choixUniqueMinPax Int?`
  - `choixMultipleDispo Boolean @default(false)`
  - `choixMultipleMinPax Int?`
  - `pdfUrl String?`
- `prisma db push` + `prisma generate` exécutés

### 2. Migration DB
- Script `prisma/migrations/scripts/migrate-menu-service-types.ts` créé
- Exécution via pg direct (ts-node ESM incompatible) : Menu Pierrade migré avec `serviceType=ASSIS, choixUniqueDispo=true, choixUniqueMinPax=20`

### 3. APIs Menus

#### `src/app/api/menus/route.ts` (POST)
- Accepte et valide : `serviceType`, `choixUniqueDispo`, `choixUniqueMinPax`, `choixMultipleDispo`, `choixMultipleMinPax`
- Validation : au moins une option de choix active, minPax > 0 si renseigné

#### `src/app/api/menus/[id]/route.ts` (PATCH)
- Même champs + même logique de validation

#### `src/app/api/menus/[id]/upload-pdf/route.ts` (POST) — nouveau
- Multipart upload vers Vercel Blob (`@vercel/blob`)
- Path : `menus/{restaurantId}/{nom-menu}-{id8}.pdf`
- Max 5 Mo, PDF uniquement
- Met à jour `menu.pdfUrl` en DB

#### `src/app/api/menus/[id]/delete-pdf/route.ts` (DELETE) — nouveau
- Supprime le blob + met `pdfUrl = null` en DB

### 4. Upload temporaire pour réponses

#### `src/app/api/attachments/upload/route.ts` — nouveau
- Upload temporaire vers Blob (`attachments/temp/{restaurantId}/{ts}-{name}.pdf`)
- Utilisé par le ReplyForm pour les pièces jointes manuelles
- Max 10 Mo, PDF uniquement
- Pas de trace DB (orphelins à nettoyer en roadmap)

### 5. UI Menus (`src/components/config/menus-client.tsx`)
- Interface `Menu` étendue avec les 6 nouveaux champs
- `minConvives` masqué dans l'UI (conservé en DB pour rollback)
- `canSave` : au moins choixUnique ou choixMultiple actif
- Carte : badge serviceType + affichage seuils
- Zone PDF par carte : drag & drop ou affichage avec lien + suppression
- Formulaire : radio serviceType, blocs choix unique / choix multiple avec checkbox + minPax, section PDF

### 6. IA — Compile (`src/lib/ai-configuration/compile.ts`)
- Section "Menus & tarifs" : format `### Nom — prix€/pers.`, serviceType, seuils, pdfUrl, régimes, description
- Règle ajoutée dans "Règles administratives" : exclusion des menus sous le seuil minimum + instruction systématique d'annexer le PDF

### 7. Suggestion menus (`src/components/demandes/demande-focus-modal.tsx`)
- `MenuJson` enrichi des 6 nouveaux champs
- `matchScore` retourne `null` (hard-exclude) si `nbInvites < seuilMin`
  - `seuilMin = min(choixUniqueMinPax || 0, choixMultipleMinPax || 0)` selon les options actives
- `menusScored` filtre les `null` avant tri — menus sous le seuil non affichés

### 8. IA — Draft (`src/app/api/demandes/[id]/ai-draft/route.ts`)
- Fetch les menus actifs avec pdfUrl
- Retourne `attachmentSuggestions: [{ name, url }]` pour les menus éligibles (pdfUrl non null + nbInvites >= seuilMin)

### 9. Envoi Graph (`src/lib/graph/messages.ts`)
- `sendGraphReply` accepte param optionnel `attachments?: { name: string; url: string }[]`
- Fetch chaque PDF par URL → base64 → POST sur `/messages/{draftId}/attachments` (Graph fileAttachment)
- Guard 30 Mo total ; erreurs par fichier : skip + console.warn

### 10. Route messages (`src/app/api/demandes/[id]/messages/route.ts`)
- Body étendu : `{ body: string; attachments?: { name: string; url: string }[] }`
- `attachments` transmis à `sendGraphReply`

### 11. Formulaire de réponse (`src/components/detail/reply-form.tsx`)
- Après génération IA : `attachmentSuggestions` du draft pré-populent les chips
- Chips sous le textarea : nom du fichier + bouton ×
- Bouton "+ PDF" : file input caché → upload vers `/api/attachments/upload` → ajout chip
- Envoi : `attachments` inclus dans le POST si non vide
- Clear des chips après envoi

### 12. Recompilation des prompts
- 3 `AIConfiguration` recompilées via pg avec la nouvelle logique compile.ts
- Le Robin (cmoecboxx000104jls85sji8n) : 1503 chars (4 espaces, 1 menu)
- Autres restaurants : 375 chars (pas d'espaces/menus actifs)

---

## Build
`npm run build` — 0 erreurs, 0 warnings.

---

## Décisions de cadrage retenues
- Q1 : `minConvives`/`maxConvives` conservés en DB (hidden UI), `maxConvives` maintenu dans matchScore comme soft penalty (score -30)
- Q2 : `BLOB_READ_WRITE_TOKEN` déjà configuré — upload opérationnel directement
- Q3 : PDFs manuels éphémères — pas de trace DB, cleanup orphelins en roadmap
