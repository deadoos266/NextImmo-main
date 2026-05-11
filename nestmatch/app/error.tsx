"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import * as Sentry from "@sentry/nextjs"
import AutoBugReporter from "./components/AutoBugReporter"

/**
 * Error boundary global pour toutes les routes sous /app.
 * Capture les runtime errors côté client et évite le crash blanc.
 * Remonte à Sentry pour monitoring prod.
 *
 * V72.1a — ajustement CTA : si la session NextAuth est active, on n'affiche
 * plus "Se connecter / S'inscrire" (cas du screenshot admin perdu en page
 * d'erreur qui voyait des boutons de login). Pour les users connectés on
 * propose "Réessayer / Accueil / Contacter le support" avec le digest
 * pré-rempli dans le sujet du mailto pour traçabilité.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { status } = useSession()
  const isAuthed = status === "authenticated"

  useEffect(() => {
    Sentry.captureException(error)
    // V72.4 — POST best-effort vers /api/admin/incident-auto pour qu'un
    // incident apparaisse dans /admin/health (en plus de Sentry). La route
    // dédup via title+service sur les 30 dernières minutes pour éviter le
    // déluge de doublons sur un bug en boucle.
    try {
      fetch("/api/admin/incident-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Erreur runtime — ${error.name || "Error"}`,
          description: error.message + (error.stack ? `\n\n${error.stack.slice(0, 3000)}` : ""),
          severity: "major",
          service: "app",
          digest: error.digest,
          url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
        keepalive: true,
      }).catch(() => { /* silent — Sentry a déjà capturé */ })
    } catch { /* SSR safety */ }
  }, [error])

  const supportSubject = encodeURIComponent(
    error.digest ? `Erreur KeyMatch — référence ${error.digest}` : "Erreur KeyMatch",
  )
  const supportBody = encodeURIComponent(
    `Bonjour,\n\nJ'ai rencontré une erreur sur KeyMatch.\n\nRéférence : ${error.digest || "—"}\nPage : ${typeof window !== "undefined" ? window.location.href : "—"}\nDate : ${new Date().toISOString()}\n\nDétails (optionnel) :\n`,
  )

  return (
    <main style={{ minHeight: "80vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      {/* V97.11 — Auto-report la runtime error dans /admin/bugs (en plus
          de Sentry + /api/admin/incident-auto déjà appelés au useEffect) */}
      <AutoBugReporter
        type="runtime-error"
        error={{ name: error.name, message: error.message, stack: error.stack, digest: error.digest }}
      />
      <div style={{ maxWidth: 560, background: "white", borderRadius: 20, padding: 40, textAlign: "center", border: "1px solid #EAE6DF" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
          Erreur inattendue
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.3px", marginBottom: 10 }}>
          Quelque chose s&apos;est mal passé
        </h1>
        <p style={{ fontSize: 14, color: "#8a8477", lineHeight: 1.6, marginBottom: 24 }}>
          {isAuthed ? (
            <>L&apos;équipe a été notifiée. Réessayez ou retournez à l&apos;accueil — votre session reste active.</>
          ) : (
            <>L&apos;équipe a été notifiée. Vous pouvez réessayer, retourner à l&apos;accueil, ou{" "}
              <Link href="/contact" style={{ color: "#111", fontWeight: 700 }}>nous contacter</Link> si le problème persiste.</>
          )}
        </p>
        {error.digest && (
          <p style={{ fontSize: 11, color: "#8a8477", marginBottom: 20, fontFamily: "monospace" }}>
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
            style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
          >
            Retour à l&apos;accueil
          </Link>
          {isAuthed && (
            <a
              href={`mailto:contact@keymatch-immo.fr?subject=${supportSubject}&body=${supportBody}`}
              style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "12px 28px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
            >
              Contacter le support
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
