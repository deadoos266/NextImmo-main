"use client"

import { useEffect } from "react"
import Link from "next/link"

/**
 * Error boundary global pour toutes les routes sous /app.
 * Capture les runtime errors côté client et évite le crash blanc.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[error boundary]", error)
  }, [error])

  return (
    <main style={{ minHeight: "80vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, background: "white", borderRadius: 20, padding: 40, textAlign: "center", border: "1px solid #e5e7eb" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
          Erreur inattendue
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.3px", marginBottom: 10 }}>
          Quelque chose s&apos;est mal passé
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
          L&apos;équipe a été notifiée. Vous pouvez réessayer, retourner à l&apos;accueil, ou{" "}
          <Link href="/contact" style={{ color: "#111", fontWeight: 700 }}>nous contacter</Link> si le problème persiste.
        </p>
        {error.digest && (
          <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 20, fontFamily: "monospace" }}>
            Référence : {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => reset()}
            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
          >
            Réessayer
          </button>
          <Link
            href="/"
            style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  )
}
