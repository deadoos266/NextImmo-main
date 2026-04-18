# PLAN — Error boundaries granulaires + Skeletons / Empty states cohérents

## 1. Contexte et objectif
`app/error.tsx` et `app/global-error.tsx` existent (fallback root). Mais pas d'error boundaries **par section** (carte annonces, chat, carnet…). Une erreur dans MapAnnonces fait sauter toute la page. Idem pour les states loading/error/empty qui ne sont pas homogènes. Poser un composant `<BoundarySection>` + convention skeletons + empty states normalisés.

Inclus dans Phase 0 parce que prérequis pour Sentry (Bloc E Sentry met captureException dans les boundaries) et prérequis pour Phase 1 (empty states + skeletons généralisés).

## 2. Audit de l'existant

- `app/error.tsx` + `app/global-error.tsx` : OK (racine).
- `app/not-found.tsx` : OK.
- Chaque section majeure monte du composant client sans boundary locale.
- Empty states divers : certains bien faits (`/favoris`), d'autres "Aucun résultat" brut.
- Skeletons : parfois une ligne "Chargement..." plain texte, parfois `<div opacity:0.4 height:110 />` rudimentaire.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/app/components/ui/BoundarySection.tsx` | **NOUVEAU** | Wrapper `{children}` avec error boundary local + `captureException` Sentry. |
| `nestmatch/app/components/ui/Skeleton.tsx` | **NOUVEAU** | Primitif `<Skeleton height width rounded />`. |
| `nestmatch/app/components/ui/EmptyState.tsx` | **NOUVEAU** | Primitif `<EmptyState icon title description ctaLabel ctaHref />`. |
| Pages consommatrices (phase 1 va les appliquer) | VÉRIFIER | On pose juste les primitifs en Phase 0. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune** (React built-in `ErrorBoundary` via `react-error-boundary` recommandé).

```bash
cd nestmatch
npm install react-error-boundary
```

## 7. Étapes numérotées

### Bloc A — BoundarySection
1. Créer `nestmatch/app/components/ui/BoundarySection.tsx` :
    ```tsx
    "use client"
    import { ErrorBoundary } from "react-error-boundary"
    import * as Sentry from "@sentry/nextjs"

    type Props = {
      name: string             // Identifiant pour le contexte Sentry
      children: React.ReactNode
      fallback?: React.ReactNode
    }

    function DefaultFallback({ name, reset }: { name: string; reset: () => void }) {
      return (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 16, padding: "18px 20px", color: "#991b1b" }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>Une erreur est survenue</p>
          <p style={{ fontSize: 13, color: "#7f1d1d", margin: "0 0 10px", lineHeight: 1.5 }}>
            La section « {name} » n'a pas pu s'afficher. Les autres parties de la page fonctionnent normalement.
          </p>
          <button type="button" onClick={reset} style={{ background: "white", color: "#991b1b", border: "1.5px solid #fecaca", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Réessayer
          </button>
        </div>
      )
    }

    export default function BoundarySection({ name, children, fallback }: Props) {
      return (
        <ErrorBoundary
          onError={(err) => {
            Sentry.captureException(err, { tags: { boundary: name } })
          }}
          fallbackRender={({ resetErrorBoundary }) =>
            fallback ?? <DefaultFallback name={name} reset={resetErrorBoundary} />
          }
        >
          {children}
        </ErrorBoundary>
      )
    }
    ```

### Bloc B — Skeleton primitif
2. Créer `nestmatch/app/components/ui/Skeleton.tsx` :
    ```tsx
    type Props = {
      width?: number | string
      height?: number | string
      rounded?: "sm" | "md" | "lg" | "full" | number
      style?: React.CSSProperties
    }

    const RADIUS_MAP = { sm: 6, md: 10, lg: 14, full: 999 }

    export default function Skeleton({ width = "100%", height = 14, rounded = "md", style }: Props) {
      const borderRadius = typeof rounded === "number" ? rounded : RADIUS_MAP[rounded]
      return (
        <div
          aria-hidden
          style={{
            width,
            height,
            borderRadius,
            background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
            backgroundSize: "200% 100%",
            animation: "skeleton-shimmer 1.4s ease-in-out infinite",
            ...style,
          }}
        />
      )
    }
    ```
3. Ajouter l'animation CSS globale. Soit dans `app/globals.css` :
    ```css
    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    ```
    → si `globals.css` absent, ajouter dans un `<style>` global dans `app/layout.tsx`.

### Bloc C — EmptyState primitif
4. Créer `nestmatch/app/components/ui/EmptyState.tsx` :
    ```tsx
    import Link from "next/link"

    type Props = {
      icon?: React.ReactNode
      title: string
      description?: string
      ctaLabel?: string
      ctaHref?: string
      onCtaClick?: () => void
    }

    export default function EmptyState({ icon, title, description, ctaLabel, ctaHref, onCtaClick }: Props) {
      const ctaStyle: React.CSSProperties = {
        display: "inline-block",
        background: "#111",
        color: "white",
        padding: "12px 26px",
        borderRadius: 999,
        textDecoration: "none",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        border: "none",
        fontFamily: "inherit",
      }
      return (
        <div style={{ background: "white", borderRadius: 20, padding: "40px 32px", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
          {icon && <div style={{ marginBottom: 14, opacity: 0.6 }}>{icon}</div>}
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: "0 0 6px" }}>{title}</h3>
          {description && <p style={{ fontSize: 13, color: "#6b7280", maxWidth: 380, margin: "0 auto 18px", lineHeight: 1.5 }}>{description}</p>}
          {ctaLabel && ctaHref && <Link href={ctaHref} style={ctaStyle}>{ctaLabel}</Link>}
          {ctaLabel && onCtaClick && !ctaHref && <button type="button" onClick={onCtaClick} style={ctaStyle}>{ctaLabel}</button>}
        </div>
      )
    }
    ```

### Bloc D — Exemple d'usage (doc)
5. Ajouter dans `nestmatch/app/components/ui/README.md` (ou en haut du fichier BoundarySection) :
    ```md
    ## Usage

    ### BoundarySection
    Wrap une section autonome. Si elle crash, le reste de la page survit + Sentry notifié.
    ```tsx
    <BoundarySection name="map-annonces">
      <MapAnnonces />
    </BoundarySection>
    ```

    ### Skeleton
    ```tsx
    {loading ? <Skeleton width={200} height={16} /> : <p>{titre}</p>}
    ```

    ### EmptyState
    ```tsx
    {items.length === 0 ? (
      <EmptyState
        title="Aucun favori"
        description="Cliquez le cœur sur une annonce pour la retrouver ici."
        ctaLabel="Voir les annonces"
        ctaHref="/annonces"
      />
    ) : <ListeFavoris items={items} />}
    ```
    ```

### Bloc E — Test basique
6. Créer `app/components/ui/Skeleton.test.tsx` (test smoke) :
    ```tsx
    import { render } from "@testing-library/react"
    import Skeleton from "./Skeleton"

    describe("Skeleton", () => {
      it("rend sans crasher", () => {
        const { container } = render(<Skeleton width={100} height={20} />)
        expect(container.firstChild).not.toBeNull()
      })
    })
    ```
    → Requiert `@testing-library/react` + `jsdom` (si absent, installer en devDep).

## 8. Pièges connus

- **`react-error-boundary`** : fonctionne uniquement côté client (`"use client"`). Pour server components, les erreurs passent par `error.tsx` du route.
- **`Sentry.captureException`** dans le `onError` : le SDK doit être init. Si Plan Sentry pas fait, retirer l'import Sentry ou gérer `if (typeof Sentry !== "undefined")`.
- **Fallback JSX** : si custom, toujours prévoir un bouton "Réessayer" (call `resetErrorBoundary`).
- **Skeleton accessibility** : `aria-hidden` car purement visuel. Ne pas abuser — écran-lecteur préfère un `aria-busy` sur le parent.
- **EmptyState CTA** : `Link` pour hrefs internes Next (déjà fait), `<a href>` pour externes. Pas d'abus de `onCtaClick` sans href si SEO/accessibilité.
- **Animations CSS skeleton** : si ajout dans `<style>` global, attention au flash de contenu non stylé au mount.
- **Nested boundaries** : 2-3 niveaux max. Plus = confusion UX (erreur catchée à plusieurs niveaux différents).

## 9. Checklist "c'est fini"

- [ ] `react-error-boundary` installé.
- [ ] `app/components/ui/BoundarySection.tsx` créé.
- [ ] `app/components/ui/Skeleton.tsx` créé.
- [ ] `app/components/ui/EmptyState.tsx` créé.
- [ ] `app/components/ui/README.md` (ou doc inline) clair.
- [ ] Animation `@keyframes skeleton-shimmer` présente globalement.
- [ ] Tests smoke passent.
- [ ] `tsc --noEmit` OK, `next build` OK.
- [ ] Les primitifs **ne sont pas encore appliqués** partout — c'est Phase 1 (empty states généralisés).

---

**Plan prêt, OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : pure primitif UI.
