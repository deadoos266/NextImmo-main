# PLAN — Bundle audit + lazy Leaflet + lazy jsPDF

## 1. Contexte et objectif
Aucune analyse de bundle faite. Leaflet (~200 KB), jsPDF (~180 KB), html2canvas (~250 KB), JSZip (~100 KB) sont lourds. Si chargés en eager sur la home, le First-Load JS explose. Audit avec `@next/bundle-analyzer` + lazy des grosses libs uniquement sur les pages qui en ont besoin.

## 2. Audit de l'existant

### Probables sources de poids (à confirmer)
- `Leaflet` + `react-leaflet` : `/annonces` uniquement utilise la carte
- `jsPDF` : 5 routes (/proprietaire/bail, /proprietaire/edl, /edl/consulter, /mon-logement PDF, /dossier PDF, /proprietaire/stats)
- `html2canvas` : utilisé pour le vieux PDF dossier (remplacé par lib/dossierPDF.ts mais import peut-être encore là)
- `JSZip` : /edl consulter (photos zip) + /dossier (zip complet)
- `jsqr` ? — probablement pas mais à vérifier
- `exifr` ? — idem
- `Anthropic SDK` : bundle `/api/agent` côté server → pas d'impact client mais à vérifier dans shared chunks

### Imports à auditer
```bash
grep -rl "from ['\"]jspdf['\"]" app/ lib/
grep -rl "from ['\"]leaflet['\"]\|from ['\"]react-leaflet['\"]" app/ lib/
grep -rl "from ['\"]html2canvas['\"]" app/ lib/
grep -rl "from ['\"]jszip['\"]" app/ lib/
```

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/next.config.js` | MODIF | Activer `@next/bundle-analyzer`. |
| `nestmatch/package.json` | MODIF | Script `analyze`. |
| `nestmatch/app/components/MapBienWrapper.tsx` | VÉRIFIER | Doit être lazy via `next/dynamic({ ssr: false })`. |
| `nestmatch/app/components/MapAnnonces.tsx` | VÉRIFIER | Idem. |
| `nestmatch/app/annonces/page.tsx` | VÉRIFIER | `dynamic(() => import("../components/MapAnnonces"))`. |
| `nestmatch/app/dossier/page.tsx` | VÉRIFIER | Retrait imports `html2canvas` (si encore présents). |
| Toutes les pages qui importent `jspdf` | À AUDITER | Doit être `await import()` inline, pas top-level. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances

```bash
cd nestmatch
npm install -D @next/bundle-analyzer
```

## 7. Étapes numérotées

### Bloc A — Installer analyzer
1. `npm install -D @next/bundle-analyzer`
2. Modifier `next.config.js` :
    ```js
    const withBundleAnalyzer = require("@next/bundle-analyzer")({
      enabled: process.env.ANALYZE === "true",
    })
    module.exports = withBundleAnalyzer(withSentryConfig(nextConfig, {...}))
    ```
3. Ajouter script dans `package.json` :
    ```json
    "analyze": "ANALYZE=true next build"
    ```
   Sur Windows : `"analyze": "cross-env ANALYZE=true next build"` (installer `cross-env` si pas déjà).

### Bloc B — Run baseline
4. `npm run analyze`
5. Ouverture auto de 2-3 pages HTML (client.html, nodejs.html, edge.html).
6. Noter **First Load JS** pour chaque route dans une table :
    ```
    Route                  First Load JS
    /                      ? KB
    /annonces              ? KB
    /annonces/[id]         ? KB
    /messages              ? KB
    /dossier               ? KB
    ```
7. Identifier les gros chunks :
    - `leaflet` → si présent dans chunks partagés ou `/annonces`
    - `jspdf` + `html2canvas` → vérifier présence dans shared
    - `jszip` → idem
    - `@anthropic-ai/sdk` → ne doit PAS apparaître côté client
8. Commit un fichier `BUNDLE_BASELINE.md` avec le tableau pour comparer après optimisations.

### Bloc C — Lazy Leaflet sur /annonces
9. Vérifier `app/annonces/page.tsx` ligne 16 :
    ```ts
    const MapAnnonces = dynamic(() => import("../components/MapAnnonces"), { ssr: false })
    ```
    → doit être présent. Si pas, ajouter.
10. `MapAnnonces.tsx` et `MapBien.tsx` doivent **eux-mêmes** lazy-importer les modules leaflet à l'intérieur du composant si possible :
    ```tsx
    "use client"
    import { useEffect, useState } from "react"
    import type { Map as LeafletMap } from "leaflet"

    export default function MapAnnonces() {
      const [ready, setReady] = useState(false)
      useEffect(() => {
        // L'import dynamique garantit que leaflet n'est embarqué que si ce composant est monté
        import("leaflet/dist/leaflet.css")
        import("./leafletSetup").then(() => setReady(true))
      }, [])
      if (!ready) return <div style={{ height: 400 }}>Chargement carte…</div>
      return <MapComponent />
    }
    ```
11. Tester : `/annonces` fonctionne, `/` ne charge PAS leaflet (vérifier dans Network devtools).

### Bloc D — Lazy jsPDF (déjà partiel)
12. Ouvrir `lib/dossierPDF.ts` : la fonction `buildDossierPDFDoc` fait déjà `await import("jspdf")` → ✓.
13. Vérifier les 5 autres routes qui utilisent jsPDF. Elles doivent toutes faire :
    ```ts
    async function genererBailPDF(data) {
      const { default: jsPDF } = await import("jspdf")
      // ...
    }
    ```
    et PAS :
    ```ts
    import jsPDF from "jspdf"  // ❌ eager
    ```
14. Pour chaque fichier de la liste, corriger si eager.
15. Recompiler et re-analyze : jsPDF ne doit plus apparaître dans le bundle initial.

### Bloc E — Audit html2canvas
16. `grep -rl "html2canvas" app/ lib/` → si présent encore dans `lib/dossierPDF.ts`, supprimer l'import (on utilise jsPDF natif maintenant).
17. `npm uninstall html2canvas` **seulement si** plus aucun import. Vérifier `grep` zéro match avant.
18. Garder en devDep si utilisé dans tests (peu probable).

### Bloc F — Audit JSZip
19. Utilisé dans `/edl/consulter/[edlId]` + `/dossier`. Déjà en `await import("jszip")` dans `/dossier`. Vérifier `/edl/consulter`.
20. Si eager, migrer en dynamic.

### Bloc G — Images optimisées (recap, overlap avec PLAN_next_image)
21. Dans `/annonces/[id]/ShareButton.tsx`, `CardPhoto`, etc. : déjà en `<img>` plain car lazy loading voulu. À ré-évaluer dans P0.8 (next/image partout).

### Bloc H — Tree-shaking lucide (si déjà installé)
22. Si `lucide-react` importé, vérifier :
    ```ts
    import { Download, Check } from "lucide-react"
    ```
    → bon (tree-shake).
    ```ts
    import * as Icons from "lucide-react"
    ```
    → mauvais.

### Bloc I — Re-analyze et commit delta
23. `npm run analyze` à nouveau.
24. Mettre à jour `BUNDLE_BASELINE.md` avec les nouvelles valeurs.
25. Objectif : First Load JS `/` < 180 KB.

## 8. Pièges connus

- **`dynamic({ ssr: false })`** sur composants avec hooks : OK. Sur composants serveur : ne fonctionne pas, utiliser `loading.tsx` + `Suspense`.
- **Leaflet CSS** : doit être chargé dynamiquement aussi. `import("leaflet/dist/leaflet.css")` dans un `useEffect`.
- **jsPDF imports top-level** : un `import jsPDF from "jspdf"` au niveau module embarque 180 KB dans le bundle même si la fonction n'est jamais appelée.
- **`@anthropic-ai/sdk` côté client** : ne doit JAMAIS être importé dans un `"use client"` component. Routes API only.
- **Fonts Google** : `next/font` cache local — OK par défaut.
- **html2canvas retiré** : vérifier zéro usage avant `npm uninstall`. Si encore utilisé dans 1 route, ne pas uninstall.
- **Bundle analyzer Windows** : `ANALYZE=true` = syntaxe Unix. Installer `cross-env` pour Windows : `npm install -D cross-env`, puis `"analyze": "cross-env ANALYZE=true next build"`.
- **CSS bundles** : le rapport analyzer ne montre pas CSS par défaut. Si bundle CSS > 100 KB, investiguer (styles inline éliminent normalement ce risque).

## 9. Checklist "c'est fini"

- [ ] `@next/bundle-analyzer` installé, `npm run analyze` fonctionne.
- [ ] `BUNDLE_BASELINE.md` créé avec First Load JS par route avant/après.
- [ ] First Load JS `/` < 180 KB.
- [ ] First Load JS `/annonces` < 250 KB (avec Leaflet lazy).
- [ ] First Load JS `/messages` < 200 KB.
- [ ] Leaflet n'apparaît pas dans shared chunks.
- [ ] jsPDF n'apparaît pas dans shared chunks (uniquement dans chunks spécifiques aux routes PDF).
- [ ] html2canvas retiré des dépendances si plus utilisé.
- [ ] `@anthropic-ai/sdk` absent du bundle client (doit être server-only).
- [ ] `npm run build` OK, `tsc --noEmit` OK.

---

**Plan prêt, OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : pure optimisation technique sans impact métier.
