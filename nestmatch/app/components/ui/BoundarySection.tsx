"use client"
import { ErrorBoundary } from "react-error-boundary"

type Props = {
  /** Identifiant lisible pour le log (ex: "map-annonces", "chat-messages"). */
  name: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

function DefaultFallback({ name, reset }: { name: string; reset: () => void }) {
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #F4C9C9", borderRadius: 16, padding: "18px 20px", color: "#b91c1c", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>Une erreur est survenue</p>
      <p style={{ fontSize: 13, color: "#7f1d1d", margin: "0 0 10px", lineHeight: 1.5 }}>
        La section « {name} » n&apos;a pas pu s&apos;afficher. Le reste de la page fonctionne normalement.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{ background: "white", color: "#b91c1c", border: "1px solid #F4C9C9", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
      >
        Réessayer
      </button>
    </div>
  )
}

/**
 * Error boundary locale : isole une section d'une page.
 *
 * Si la section crash, le reste de la page continue de vivre + l'erreur est
 * remontée à Sentry via tag `boundary:<name>` (quand Plan Sentry actif).
 *
 * Usage :
 *   <BoundarySection name="map-annonces">
 *     <MapAnnonces />
 *   </BoundarySection>
 */
export default function BoundarySection({ name, children, fallback }: Props) {
  return (
    <ErrorBoundary
      onError={(err) => {
        // Intégration Sentry conditionnelle : si le SDK n'est pas chargé, on
        // ne fait que logger en console. Quand Plan Sentry actif, ajouter :
        //   Sentry.captureException(err, { tags: { boundary: name } })
        console.error(`[BoundarySection:${name}]`, err)
      }}
      fallbackRender={({ resetErrorBoundary }) =>
        fallback ?? <DefaultFallback name={name} reset={resetErrorBoundary} />
      }
    >
      {children}
    </ErrorBoundary>
  )
}
