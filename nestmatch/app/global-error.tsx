"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import AutoBugReporter from "./components/AutoBugReporter"

/**
 * Fallback ultime — déclenché uniquement si error.tsx lui-même échoue ou
 * si l'erreur arrive dans le layout racine. Ne doit PAS dépendre de
 * Providers / Navbar / Footer (ils ne sont pas encore montés).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
    // V72.4 — incident-auto pour /admin/health. Severity 'critical' ici car
    // global-error ne se déclenche QUE si le layout racine lui-même crash —
    // bien plus grave qu'une erreur de page (error.tsx).
    try {
      fetch("/api/admin/incident-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Erreur critique layout — ${error.name || "Error"}`,
          description: error.message + (error.stack ? `\n\n${error.stack.slice(0, 3000)}` : ""),
          severity: "critical",
          service: "app",
          digest: error.digest,
          url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
        keepalive: true,
      }).catch(() => { /* silent */ })
    } catch { /* SSR safety */ }
  }, [error])

  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F7F4EF", margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        {/* V97.11 — Auto-report critique dans /admin/bugs (severity=critical) */}
        <AutoBugReporter
          type="global-error"
          error={{ name: error.name, message: error.message, stack: error.stack, digest: error.digest }}
        />
        <div style={{ maxWidth: 520, background: "white", borderRadius: 20, padding: 40, textAlign: "center", border: "1px solid #EAE6DF" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>Erreur critique</h1>
          <p style={{ fontSize: 14, color: "#8a8477", lineHeight: 1.6, margin: "0 0 24px" }}>
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
              style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
            >
              Accueil
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
