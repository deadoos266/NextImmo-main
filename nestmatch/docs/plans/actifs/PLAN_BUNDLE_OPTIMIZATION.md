# PLAN — Bundle client optimization

**Créé** : 2026-04-24 (Round 4 — audit fragilités R4.4)
**Statut** : Analyse + recommandations, non appliqué
**Impact visé** : First Load JS `/dossier` < 320 kB (actuel 331 kB), `/messages` < 270 kB (actuel 288 kB).

---

## Baseline actuel (`next build` 2026-04-24)

Shared chunks (toutes pages) : **181 kB**
Middleware : 76.6 kB

### Top 10 pages par First Load JS

| Route                              | Page JS  | First Load | Catégorie |
|------------------------------------|----------|------------|-----------|
| `/dossier`                         | **150 kB** | 331 kB   | 🔴 monster |
| `/messages`                        | 32.9 kB  | **288 kB** | 🔴         |
| `/proprietaire/bail/[id]`          | 32.5 kB  | 280 kB    | 🟡         |
| `/annonces`                        | 19.2 kB  | 280 kB    | 🟡 (map + filtres) |
| `/proprietaire/stats`              | 18.9 kB  | 269 kB    | 🟡         |
| `/proprietaire/edl/[id]`           | 18 kB    | 266 kB    | 🟡         |
| `/edl/consulter/[edlId]`           | 17.8 kB  | 273 kB    | 🟡         |
| `/mon-logement`                    | 15.4 kB  | 271 kB    | 🟡         |
| `/favoris`                         | 11.2 kB  | 267 kB    | ⚪         |
| `/annonces/[id]`                   | 8.6 kB   | 259 kB    | ⚪         |

Le `/dossier` à 150 kB est **7× la page médiane**. Toutes les autres pages importantes sont dominées par le shared chunks + un pic de page légitime (carte, messagerie).

---

## Ce qui est DÉJÀ bien

- **jspdf** (~400 kB non compressé) : 100 % en `await import("jspdf")` (6 call-sites). Zéro dans le bundle initial.
- **Map Leaflet** : `MapAnnonces` / `MapBien` chargés via `next/dynamic({ ssr: false })` dans `/annonces`, `/annonces/[id]`, `/favoris`.
- **`dossierPDF`** : lazy-loaded dans `/dossier/page.tsx:1552` + 1566.
- **`bailPDF`** : lazy-loaded dans `/messages/page.tsx:348` + `/mon-logement/page.tsx:160`.

Donc les 3 gros candidats habituels (pdf, carte, éditeur riche) ne sont pas dans le bundle initial. Le poids résiduel vient du **code métier** lui-même.

---

## /dossier — les 150 kB en détail

**Fichier** : `app/dossier/page.tsx` (2 160 lignes — un seul composant client)

### Pourquoi c'est si gros

1. **Logique de dossier locataire** : 6 états (principal + garant), 12 catégories de documents, upload/validation, SharePanel + AccessLogPanel.
2. **Constants inline** : `SITUATIONS`, `TYPES_GARANT`, `DOCS_REQUIS`, `DOCS_OPTIONNELS`, `DOC_MAX` (restent dans le bundle de la page).
3. **`lib/nationalites.ts`** : 248 lignes — liste complète des nationalités pour le dropdown (tree-shakable ? oui mais `filterNationalites` exige toute la liste).
4. **`SharePanel` (294 lignes)** : gère la génération de tokens de partage — UI + fetch. Invisible tant qu'on est dans la section "documents", monté seulement en bas de page.
5. **`AccessLogPanel` (111 lignes)** : log des accès — idem, monté en bas.
6. Pas de `memo`, chaque frappe sur un champ déclenche un re-render complet du formulaire.

### Actions recommandées (ROI décroissant)

**1. Extraire SharePanel + AccessLogPanel en dynamic import** — gain estimé **~8-12 kB**.
```tsx
const SharePanel = dynamic(() => import("./SharePanel"), { ssr: false, loading: () => <DocRowSkeleton /> })
const AccessLogPanel = dynamic(() => import("./AccessLogPanel"), { ssr: false })
```
Les deux panels sont en bas de la page — 99 % des users chargent la page, remplissent le dossier, ne scrollent pas jusqu'en bas avant des jours.

**2. Scinder le formulaire garant en composant lazy** — gain estimé **~15-20 kB**.
Le formulaire garant ne s'affiche que si `with_garant === true`. Actuellement l'UI + la validation sont tous dans `page.tsx`. Extraire `GarantForm.tsx` + dynamic import quand la checkbox est cochée.

**3. Déplacer `nationalites.ts` en JSON lazy-loaded** — gain estimé **~4-6 kB**.
```tsx
const [nats, setNats] = useState<string[]>([])
useEffect(() => { import("../../lib/nationalites").then(m => setNats(m.NATIONALITES)) }, [])
```
Seul le select ouvre la liste.

**4. Mémoïser les sections de documents** — pas un gain bundle mais un gain runtime énorme.

**Cumul potentiel** : **~30 kB** sur /dossier → First Load ~300 kB.

---

## /messages — les 288 kB

`app/messages/page.tsx` (3 843 lignes).

### Diagnostic

- `BailSignatureModal` importé statique (ligne 18). Ouvre une modal + logique de signature. Utilisé seulement sur 1-2 conversations / jour / user.
- `AnnulerVisiteDialog`, `ProposerVisiteDialog` importés statique (13-14). Ouverts à la demande.
- `calculerScore` (`lib/matching.ts`) : importé statique pour afficher le score côté conversation. 0-10 kB.
- `postNotif` (notif client) et tout le realtime Supabase : actifs à chaque ouverture de la page → OK on ne peut pas lazy.

### Actions recommandées

**1. Dynamic import des 3 dialogs** — gain estimé **~10-15 kB**.
```tsx
const BailSignatureModal = dynamic(() => import("../components/BailSignatureModal"), { ssr: false })
const AnnulerVisiteDialog = dynamic(() => import("../components/AnnulerVisiteDialog"), { ssr: false })
const ProposerVisiteDialog = dynamic(() => import("../components/ProposerVisiteDialog"), { ssr: false })
```

**2. Splitter `page.tsx` en sous-composants** (conversation list / thread view / compose). Refactor plus gros — à planifier séparément.

**Cumul potentiel** : **~15 kB** sur /messages → First Load ~270 kB.

---

## /annonces — 280 kB (post-handoff Round 3)

### Diagnostic

- `AnnoncesClient.tsx` + `FiltersBar` + `FiltersModal` + `ListingCardSearch` → ~19 kB de logique filtres complexes.
- `MapAnnonces` : déjà lazy via `useEffect/import`.
- `ListingCardSearch` et `FiltersBar` sont potentiellement tree-shakables mais importés statique.

### Actions recommandées

**1. Précharger `MapAnnonces` à l'idle** (pas à la visibilité) pour que le toggle Liste/Carte soit instantané :
```tsx
useEffect(() => {
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(() => import("../components/MapAnnonces"))
  }
}, [])
```
**Gain bundle** : 0 (déjà dynamique). **Gain UX** : toggle immédiat.

**2. `FiltersModal` (mobile uniquement) en dynamic** — gain estimé **~3-5 kB** pour les desktops.

---

## /proprietaire/bail/[id] — 280 kB

**Fichier** : 2 461 lignes. Contient le formulaire de rédaction de bail + preview + signature.

### Actions

**1. Composant Preview du bail en dynamic** — gain estimé **~8 kB**.
**2. Signature pad (si canvas) en dynamic** — gain estimé **~4 kB**.

---

## /proprietaire/stats — 269 kB

**Fichier** : 1 515 lignes. Génère aussi un PDF via jspdf (déjà lazy).

Le gros du poids c'est les charts / dashboards. Actions probables :
1. Si `recharts` ou `chart.js` utilisés : dynamic import. (À vérifier, pas trouvé dans `package.json` donc probablement custom SVG.)
2. Mémoïser les agrégations coûteuses.

---

## Candidats cross-page (shared chunks 181 kB)

Le shared baseline est à 181 kB — c'est élevé mais pas aberrant pour une app Next 15 + Supabase + NextAuth + Sentry. Décomposition estimée :
- React 19 + Next runtime : ~70 kB
- Supabase JS v2 : ~40 kB (avec realtime même sans l'utiliser partout)
- NextAuth client : ~20 kB
- Sentry/nextjs : ~25 kB
- App code partagé (providers, hooks, km.tsx) : ~25 kB

### Levers sur le shared

**1. Tree-shaker Supabase realtime** — On ne l'utilise que sur messages/notifications. Envisager d'initialiser le client realtime séparément (`lib/supabase-realtime.ts`) et n'importer que lui dans les pages concernées. Gain estimé : **~15-20 kB sur shared** → impact sur TOUTES les pages.

**2. Lazy Sentry** — déjà configuré via `sentry.client.config.ts`, mais peut être encore plus lazy en `beforeSend` minimal puis upgrade. Gain marginal.

**3. Audit `lib/matching.ts`** — importé côté client uniquement pour l'affichage. Vérifier qu'on n'expose pas la fonction de score complète (1000 pts) si un simple score-cache suffit.

---

## Ordre d'implémentation recommandé

Ordre par **ROI bundle ÷ risque** :

1. **P1 — SharePanel + AccessLogPanel dynamic** sur /dossier (~10 kB, 0 risque, 15 min)
2. **P1 — 3 dialogs dynamic** sur /messages (~15 kB, faible risque, 30 min)
3. **P2 — `nationalites.ts` lazy** (~5 kB, faible risque, 20 min)
4. **P2 — FiltersModal dynamic mobile** (~4 kB, 0 risque car déjà conditionnel, 15 min)
5. **P3 — GarantForm extraction dynamic** (~15 kB, refactor plus gros, 1-2 h)
6. **P3 — Split Supabase realtime** (~15-20 kB SUR TOUTES LES PAGES, 2-3 h)
7. **P3 — Bail preview dynamic** (~8 kB, 45 min)

Cumul P1+P2+P3 : **~70-80 kB sur /dossier**, **~30 kB sur /messages**, **~20 kB sur shared**.

---

## Ce que l'audit a aussi confirmé

✅ Pas d'import statique de jspdf, leaflet, jszip dans le bundle initial
✅ Pas de moment.js, date-fns (on utilise `Intl` natif)
✅ Pas de dépendance lourde non utilisée dans `package.json`
✅ `next/dynamic({ ssr: false })` bien utilisé pour les composants browser-only

L'app n'a pas de dette "gros fichier importé partout inutilement" — elle a une dette **"pages uniques très grosses"**. Le vrai levier est le splitting intra-page, pas la dépendance tiers.

---

## Test plan post-implémentation

- `pnpm build` après chaque P1/P2/P3 → vérifier le delta sur la page ciblée
- Vérifier que le chargement lazy ne casse pas la première interaction (skeleton OK)
- `pnpm analyze` (bundle analyzer) pour valider qu'on a bien déplacé le code dans un chunk séparé, pas juste dédupliqué
- Sentry 48 h : zéro spike `ChunkLoadError` (cache-buster correct)
