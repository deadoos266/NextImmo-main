"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

/**
 * Fallback ultime — déclenché uniquement si error.tsx lui-même échoue ou
 * si l'erreur arrive dans le layout racine. Ne doit PAS dépendre de
 * Providers / Navbar / Footer (ils ne sont pas encore montés).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F7F4EF", margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ maxWidth: 520, background: "white", borderRadius: 20, padding: 40, textAlign: "center", border: "1px solid #e5e7eb" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>Erreur critique</h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 24px" }}>
            La page n&apos;a pas pu se charger. Rafraîchissez ou revenez à l&apos;accueil.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => reset()}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Rafraîchir
            </button>
            <a
              href="/"
              style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
            >
              Accueil
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
