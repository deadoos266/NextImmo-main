# PLAN — Composant Logo unique réutilisable

## 1. Contexte et objectif
Le branding NestMatch est actuellement du texte brut (`<h1>NestMatch</h1>`) disséminé dans 30+ fichiers : Navbar, Footer, PDFs (bail, quittance, EDL, dossier), auth layout, metadata og, emails transactionnels (à venir). Objectif : créer **un seul composant `<Logo />`** + un seul helper PDF + un seul fichier asset, pour que quand le vrai logo arrive, le switch se fasse en changeant **1 fichier** au lieu de 30.

## 2. Audit de l'existant — emplacements "NestMatch" à centraliser

### Composants / pages client
| Fichier | Usage actuel | Cible composant |
|---|---|---|
| `app/components/Navbar.tsx:107` | `<span>NestMatch</span>` — titre navbar | `<Logo variant="navbar" />` |
| `app/components/Footer.tsx` | Nom dans le footer | `<Logo variant="footer" />` |
| `app/components/CookieBanner.tsx` | Texte cookie mention | String `BRAND.name` depuis lib |
| `app/auth/layout.tsx` | Metadata + header | `<Logo variant="auth" />` |
| `app/auth/page.tsx` | H1 header | `<Logo variant="auth" />` |
| `app/not-found.tsx` | Titre 404 | `<Logo variant="compact" />` |
| `app/page.tsx` | Landing — probable usage hero | `<Logo variant="hero" />` |
| `app/layout.tsx` | Metadata `title`, `og:site_name` | `BRAND.name` constante |

### Pages contenu
| Fichier | Usage | Cible |
|---|---|---|
| `app/cgu/page.tsx`, `app/confidentialite/page.tsx`, `app/mentions-legales/page.tsx`, `app/cookies/page.tsx` | Texte légal | `BRAND.name` |
| `app/contact/layout.tsx`, `app/contact/page.tsx` | Titre + intro | `BRAND.name` |
| `app/estimateur/layout.tsx` | Titre | `BRAND.name` |
| `app/plan-du-site/page.tsx` | Titre | `BRAND.name` |
| `app/location/[ville]/page.tsx` | Landing SEO ville | `BRAND.name` |

### APIs générant du contenu
| Fichier | Usage | Cible |
|---|---|---|
| `app/api/agent/route.ts` | Prompt système IA | `BRAND.name` |
| `app/api/visites/ics/route.ts` | ICS calendar `X-WR-CALNAME:NestMatch` | `BRAND.name` |

### PDFs générés
| Fichier | Usage | Cible |
|---|---|---|
| `app/proprietaire/bail/[id]/page.tsx` | Header PDF bail | Helper `drawLogoPDF(doc, x, y)` depuis `lib/brand.ts` |
| `app/proprietaire/edl/[id]/page.tsx` | Header PDF EDL | idem |
| `app/proprietaire/stats/page.tsx` | Header quittance PDF | idem |
| `app/edl/consulter/[edlId]/page.tsx` | Header PDF EDL consult | idem |
| `app/mon-logement/page.tsx` | Header PDF historique loyers (batch 39) | idem |
| `app/dossier/page.tsx` | Header PDF dossier locataire | idem (via `lib/dossierPDF.ts` à créer) |
| Futurs : emails transactionnels | Header email HTML | String templated avec `BRAND.name` + URL logo |

### Assets
- **Aucun `/public/logo*.svg` dédié** actuellement. Favicon : vérifier `app/favicon.ico` (standard Next).
- `/public/og-default.png` existe (OG image par défaut).

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/lib/brand.ts` | **NOUVEAU** | Exporte `BRAND = { name, tagline, url, email, colors }` + helper `getLogoPath(variant)` + type `LogoVariant`. |
| `nestmatch/app/components/Logo.tsx` | **NOUVEAU** | Composant React client + server safe. Variants : `navbar`, `footer`, `auth`, `hero`, `compact`, `email`. Par défaut renvoie du texte stylé (placeholder). Quand le SVG arrive, swap dans ce seul fichier. |
| `nestmatch/lib/brandPDF.ts` | **NOUVEAU** | Exporte `drawLogoPDF(doc, { x, y, width, color? })` pour jsPDF. Par défaut dessine le texte "NestMatch" en bold ; quand le logo vectoriel arrive, dessine le SVG (via jsPDF `addSvgAsImage` ou PNG converti). |
| `nestmatch/public/logo.svg` | **NOUVEAU PLACEHOLDER** | SVG texte simple "NestMatch" (sera remplacé par le vrai logo). Garde le même nom pour pas casser. |
| `nestmatch/public/logo-mark.svg` | **NOUVEAU PLACEHOLDER** | Version carré/icône (favicon + PWA + email). |
| `nestmatch/public/og-default.png` | Existe | À regénérer quand logo final arrive, mais pas critique. |
| `nestmatch/app/layout.tsx` | MODIF | Remplacer hardcoded title par `BRAND.name` + metadata.icons. |
| `nestmatch/app/components/Navbar.tsx` | MODIF | Remplacer ligne 107 (`NestMatch`) par `<Logo variant="navbar" />`. |
| `nestmatch/app/components/Footer.tsx` | MODIF | Remplacer par `<Logo variant="footer" />`. |
| `nestmatch/app/auth/page.tsx`, `app/auth/layout.tsx` | MODIF | `<Logo variant="auth" />`. |
| `nestmatch/app/not-found.tsx` | MODIF | `<Logo variant="compact" />`. |
| `nestmatch/app/page.tsx` | MODIF | Hero `<Logo variant="hero" />` si applicable. |
| Fichiers pages "NestMatch" en texte (cgu, contact, etc.) | MODIF | Import `BRAND.name` au lieu de string littérale. Pour le texte courant dans paragraphes légaux, laisser tel quel (moins prioritaire). |
| **Tous les PDFs (bail, quittance, EDL×2, dossier, historique loyers)** | MODIF | En tête : remplacer `doc.text("NESTMATCH", ...)` par `drawLogoPDF(doc, { x, y })`. |
| `nestmatch/app/api/visites/ics/route.ts` | MODIF | `X-WR-CALNAME:${BRAND.name}`. |
| `nestmatch/app/api/agent/route.ts` | MODIF | Prompt système `BRAND.name`. |
| `nestmatch/app/favicon.ico` | À remplacer | Dérivé du logo final (Sonnet ne fait pas cette étape, elle arrive quand le fichier source arrive). |
| `nestmatch/app/icon.png`, `apple-icon.png` | À créer | Next 13+ convention, dérivé logo-mark. |
| `nestmatch/app/sitemap.ts`, `nestmatch/app/robots.ts` | Pas touché | OK. |

## 4. Migrations SQL
**Aucune**. Pur frontend / assets.

## 5. Étapes numérotées atomiques

### Bloc A — Constantes brand
1. Créer `lib/brand.ts` :
   ```ts
   export const BRAND = {
     name: "NestMatch",
     tagline: "La location entre particuliers, sans frais d'agence",
     url: "https://nestmatch.fr",
     email: "contact@nestmatch.fr",
     // Couleurs à réutiliser dans Logo (éviter répétition)
     colors: {
       primary: "#111",
       background: "#F7F4EF",
       accent: "#16a34a",
     },
   } as const

   export type LogoVariant = "navbar" | "footer" | "auth" | "hero" | "compact" | "email" | "pdf"
   ```

### Bloc B — Composant Logo texte (placeholder)
2. Créer `app/components/Logo.tsx` (client-safe, no "use client" nécessaire — pas de hook) :
   ```tsx
   import Link from "next/link"
   import { BRAND, type LogoVariant } from "../../lib/brand"

   type Props = {
     variant?: LogoVariant
     /** Si true, pas de Link wrapper (utile dans emails/PDF) */
     asLink?: boolean
     color?: string
   }

   const SIZES: Record<LogoVariant, { fontSize: number; weight: number; letterSpacing: string }> = {
     navbar:  { fontSize: 22, weight: 900, letterSpacing: "-0.5px" },
     footer:  { fontSize: 18, weight: 800, letterSpacing: "-0.3px" },
     auth:    { fontSize: 28, weight: 900, letterSpacing: "-0.8px" },
     hero:    { fontSize: 42, weight: 900, letterSpacing: "-1.2px" },
     compact: { fontSize: 16, weight: 800, letterSpacing: "-0.3px" },
     email:   { fontSize: 22, weight: 800, letterSpacing: "-0.5px" },
     pdf:     { fontSize: 18, weight: 800, letterSpacing: "-0.3px" }, // utilisé uniquement par drawLogoPDF indirectement
   }

   export default function Logo({ variant = "navbar", asLink = true, color }: Props) {
     const s = SIZES[variant]
     const content = (
       <span style={{
         fontFamily: "'DM Sans', sans-serif",
         fontSize: s.fontSize,
         fontWeight: s.weight,
         letterSpacing: s.letterSpacing,
         color: color || BRAND.colors.primary,
         lineHeight: 1,
         display: "inline-flex",
         alignItems: "center",
       }}>
         {BRAND.name}
       </span>
     )
     if (!asLink) return content
     return <Link href="/" style={{ textDecoration: "none" }}>{content}</Link>
   }
   ```
3. Créer `public/logo.svg` (SVG minimal texte) :
   ```svg
   <?xml version="1.0" encoding="UTF-8"?>
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 50" role="img" aria-label="NestMatch">
     <text x="0" y="38" font-family="DM Sans, system-ui, sans-serif" font-weight="900" font-size="38" fill="#111" letter-spacing="-1">NestMatch</text>
   </svg>
   ```
4. Créer `public/logo-mark.svg` (version icône carré) :
   ```svg
   <?xml version="1.0" encoding="UTF-8"?>
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="NestMatch">
     <rect width="64" height="64" rx="14" fill="#111"/>
     <text x="32" y="44" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-weight="900" font-size="36" fill="#F7F4EF">N</text>
   </svg>
   ```
   Ces deux placeholders existent uniquement pour tester la chaîne — seront remplacés par Paul.

### Bloc C — Remplacement dans composants React
5. Navbar (`app/components/Navbar.tsx:107`) : remplacer `NestMatch {isAdmin && ...}` par :
   ```tsx
   <Logo variant="navbar" /> {isAdmin && <Link href="/admin" style={...}>ADMIN</Link>}
   ```
   Le Link racine existant wrappant le logo devient redondant — enlever.
6. Footer (`app/components/Footer.tsx`) : remplacer le `<p>NestMatch</p>` par `<Logo variant="footer" />`.
7. Auth page (`app/auth/page.tsx`) : identifier le h1/titre, remplacer par `<Logo variant="auth" />`.
8. `app/not-found.tsx` : header titre → `<Logo variant="compact" />`.
9. `app/page.tsx` : vérifier hero. Si titre-brand présent, `<Logo variant="hero" />`.

### Bloc D — Remplacement dans metadata / APIs
10. `app/layout.tsx` : `import { BRAND } from "../lib/brand"` → utiliser `BRAND.name` dans title/metadata. Ajouter `icons: { icon: "/logo-mark.svg", apple: "/apple-icon.png" }`.
11. `app/api/visites/ics/route.ts` : `import { BRAND }` → `X-WR-CALNAME:${BRAND.name}`.
12. `app/api/agent/route.ts` : `import { BRAND }` → `BRAND.name` dans le prompt système.
13. Pages texte (`cgu`, `confidentialite`, `mentions-legales`, `cookies`, `contact`, etc.) : dans les h1 et titres — `BRAND.name`. Pour les paragraphes légaux, laisser le texte littéral (moins critique, pas touché).

### Bloc E — Helper PDF
14. Créer `lib/brandPDF.ts` :
    ```ts
    import type { jsPDF } from "jspdf"
    import { BRAND } from "./brand"

    export function drawLogoPDF(doc: jsPDF, opts: { x: number; y: number; color?: string; size?: "small" | "medium" | "large" } = { x: 20, y: 20 }): void {
      const size = opts.size || "medium"
      const fontSize = size === "small" ? 12 : size === "large" ? 20 : 16
      doc.setFont("helvetica", "bold")
      doc.setFontSize(fontSize)
      if (opts.color) doc.setTextColor(opts.color)
      else doc.setTextColor(17, 17, 17) // #111
      doc.text(BRAND.name, opts.x, opts.y)
      // Reset couleur par défaut pour pas polluer
      doc.setTextColor(0, 0, 0)
    }

    /**
     * Quand le logo vectoriel arrivera :
     * 1. Placer /public/logo.svg (version finale).
     * 2. Convertir en base64 PNG (via outil build-time ou runtime fetch).
     * 3. Remplacer drawLogoPDF par doc.addImage(logoPngBase64, ...).
     * Toute la chaîne bénéficiera automatiquement.
     */
    ```
15. Remplacer dans chaque PDF (bail, edl×2, quittance stats, dossier, historique loyers) le bloc "doc.setFontSize(20); doc.text(BRAND_NAME_UPPERCASE, ...)" par `drawLogoPDF(doc, { x: 105, y: 25, size: "large" })` (ajuster x/y selon le centrage).
16. Vérifier que les PDFs existants conservent leur layout (pas de décalage texte).

### Bloc F — Favicon / icônes Next
17. Ajouter `app/icon.svg` (copie de `logo-mark.svg`) → Next le prend en icône automatiquement.
18. Créer `app/apple-icon.png` 180×180 (à générer depuis logo-mark quand image finale dispo). Skip pour l'instant si le build tolère.
19. Garder `app/favicon.ico` tel quel (remplacé par Paul avec le vrai logo plus tard).

### Bloc G — Documentation dev
20. Ajouter un court commentaire en haut de `lib/brand.ts` :
    ```ts
    /**
     * SOURCE DE VÉRITÉ du branding NestMatch.
     * Pour remplacer le logo :
     *  1. Placer le SVG final dans /public/logo.svg et /public/logo-mark.svg
     *  2. Convertir en base64 PNG et placer dans LOGO_PNG_BASE64 (voir lib/brandPDF.ts)
     *  3. Si le logo change de forme (icône + texte), adapter app/components/Logo.tsx
     *     variants. RIEN d'autre à toucher.
     */
    ```

## 6. Pièges connus

- **PDF et police DM Sans** : jsPDF par défaut utilise helvetica. Ne pas essayer d'embarquer DM Sans (embed font = 500 Ko par PDF). Pour les PDFs, helvetica bold reste cohérent. Quand logo SVG arrivera, utiliser `addImage` (PNG base64) et non le texte.
- **Server vs Client component** : `Logo.tsx` n'utilise pas de hook → peut être mounté dans server ET client components. Pas de `"use client"`.
- **Link wrapper** : Logo est cliquable vers `/` par défaut (navbar, footer). Dans auth/hero/compact, `asLink={false}` si inapproprié (ex : auth = déjà sur la page home-like).
- **SSR hydration** : pas de `useSession` / state → 0 problème de flash.
- **Metadata title / og** : garder `BRAND.name` constant. Si marketing veut un tagline spécifique par page, autoriser override mais default au BRAND.tagline.
- **SEO** : le mot "NestMatch" doit rester **présent en texte réel** (alt, aria-label, visible) même quand on swappera vers un SVG image. Sinon Google lit "image". → Toujours inclure `role="img"` + `aria-label={BRAND.name}` sur les SVG + alt sur img.
- **PDFs pré-existants** : ne PAS modifier le layout (proprio a des bails signés avec le layout actuel). Seule la zone "en tête" change, le reste intact.
- **Ordre d'ajout** : faire **d'abord** `lib/brand.ts` + `Logo.tsx` + SVG placeholders, puis migrer fichier par fichier en commit atomique par fichier (pas un big bang).
- **Texte vs SVG dans ICS** : `X-WR-CALNAME:NestMatch` doit rester texte pur (ICS n'accepte pas SVG). OK avec BRAND.name.

## 7. Checklist "c'est fini"

- [ ] `lib/brand.ts` existe et exporte `BRAND`, `LogoVariant`.
- [ ] `app/components/Logo.tsx` existe, accepte `variant`, `asLink`, `color`.
- [ ] `public/logo.svg` et `public/logo-mark.svg` existent (placeholders texte).
- [ ] `lib/brandPDF.ts` exporte `drawLogoPDF`.
- [ ] Navbar, Footer, Auth, NotFound, Home utilisent `<Logo />`.
- [ ] Tous les 6+ PDFs utilisent `drawLogoPDF`.
- [ ] `app/api/visites/ics/route.ts` et `app/api/agent/route.ts` utilisent `BRAND.name`.
- [ ] `grep -rn "NestMatch" app --include="*.tsx" --include="*.ts"` retourne SEULEMENT : `lib/brand.ts`, éventuellement les paragraphes légaux (cgu, mentions), les commentaires.
- [ ] `npx tsc --noEmit` pass.
- [ ] `npx next build` pass.
- [ ] `npx vitest run` pass.
- [ ] Chargement `/` : logo visible, lien → /, font identique à avant.
- [ ] PDF bail généré : header "NestMatch" centré, pas de régression de layout.
- [ ] Favicon toujours visible.
- [ ] OG image toujours fonctionnelle.
- [ ] **Quand Paul envoie le vrai logo** : il suffit de remplacer `public/logo.svg`, `public/logo-mark.svg`, et (si besoin) encoder le PNG base64 dans `lib/brandPDF.ts`. **Aucun autre fichier touché**.

---

⚠️ **EXÉCUTION OPUS UNIQUEMENT** : aucun bloc sensible (pas de sécurité, pas de logique métier, pas de RLS). **Tout peut être fait par Sonnet.**

**Plan prêt, OK pour Sonnet.**
