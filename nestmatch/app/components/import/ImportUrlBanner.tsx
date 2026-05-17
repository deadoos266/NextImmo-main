"use client"
import { useState } from "react"
import type { ImportedAnnonce } from "../../../lib/import/types"

/**
 * V97.36 P3-7 — Bandeau de l'import URL dans le wizard /proprietaire/ajouter.
 *
 * Affiche un input collable (URL Leboncoin/SeLoger/...) + bouton "Importer".
 * Au click :
 *  - POST /api/proprio/annonce/import { url }
 *  - Si OK → callback onImported(data, warnings) qui pré-remplit le form
 *  - Si fail → message d'erreur clair sous l'input
 *
 * Dismissible (croix en haut à droite), garde l'état "fermé" en mémoire
 * via localStorage pour éviter de réapparaître à chaque visite.
 */

interface Props {
  onImported: (data: ImportedAnnonce) => void
  onDismiss?: () => void
  initiallyDismissed?: boolean
}

// V97.39.8 — Sites prioritairement supportés (les plus fiables côté extraction)
// La liste complète est sur /aide/import-annonce (PAP + 12 réseaux d'agences
// fiables + 3 sites DataDome en best-effort).
const SUPPORTED_LABELS = ["PAP", "Foncia", "Orpi", "Century 21", "Laforêt"]

export default function ImportUrlBanner({ onImported, onDismiss, initiallyDismissed = false }: Props) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(initiallyDismissed)

  if (dismissed) return null

  async function handleImport() {
    const trimmed = url.trim()
    if (!trimmed) { setError("Colle d'abord un lien."); return }
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("L'URL doit commencer par https:// ou http://")
      return
    }
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/proprio/annonce/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        // V97.36 — message contextuel selon le code d'erreur
        // V97.39 — ajout des codes WORKER_* pour le bypass DataDome via worker self-host
        let msg = j.error || "Import échoué. Vérifie l'URL et réessaie."
        if (j.code === "BOT_PROTECTION") {
          msg = "Ce site bloque l'extraction même avec notre service stealth. Saisis les infos manuellement, ou essaie depuis un site d'agence (Foncia, Orpi, Century 21, etc.)."
        } else if (j.code === "NOT_FOUND") {
          msg = "Annonce introuvable. Vérifie que tu as collé l'URL de la fiche (pas une recherche) et que l'annonce est encore en ligne."
        } else if (j.code === "TIMEOUT" || j.code === "WORKER_TIMEOUT") {
          msg = "Le site (ou notre service d'extraction) prend trop de temps. Réessaie dans quelques minutes."
        } else if (j.code === "WORKER_UNAVAILABLE" || j.code === "WORKER_NOT_CONFIGURED") {
          msg = "Notre service d'extraction pour ce site est temporairement indisponible. Réessaie dans 5 minutes, ou saisis manuellement."
        } else if (j.code === "RATE_LIMITED") {
          msg = "Trop d'imports — réessaye dans 1 h."
        }
        setError(msg)
        setLoading(false)
        return
      }
      onImported(j.data as ImportedAnnonce)
      setLoading(false)
    } catch {
      setError("Erreur réseau. Vérifie ta connexion et réessaie.")
      setLoading(false)
    }
  }

  function dismiss() {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)",
        border: "1px solid #D7E3F4",
        borderRadius: 18,
        padding: "18px 20px",
        marginBottom: 20,
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer le bandeau d'import"
        style={{
          position: "absolute", top: 10, right: 12,
          background: "transparent", border: "none",
          color: "#8a8477", fontSize: 18, cursor: "pointer",
          padding: 4, lineHeight: 1, fontFamily: "inherit",
        }}
      >
        ×
      </button>

      <p style={{ fontSize: 10, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 6px" }}>
        Gagne du temps
      </p>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111", margin: "0 0 6px", lineHeight: 1.3 }}>
        Tu as déjà publié cette annonce ailleurs ?
      </h2>
      <p style={{ fontSize: 13, color: "#3f3c37", margin: "0 0 14px", lineHeight: 1.55 }}>
        Colle ton lien {SUPPORTED_LABELS.join(", ")} et 13 autres sites — on remplit le formulaire pour toi.
        Tu pourras tout modifier ensuite. <a href="/aide/import-annonce" style={{ color: "#1d4ed8", textDecoration: "underline" }}>Liste complète</a>.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null) }}
          placeholder="https://www.leboncoin.fr/locations/..."
          disabled={loading}
          onKeyDown={e => { if (e.key === "Enter" && !loading) { e.preventDefault(); handleImport() } }}
          style={{
            flex: 1, minWidth: 240,
            padding: "11px 14px",
            border: "1px solid #D7E3F4",
            borderRadius: 12,
            fontSize: 14, fontFamily: "inherit",
            background: "#fff", color: "#111",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={handleImport}
          disabled={loading || !url.trim()}
          style={{
            background: loading || !url.trim() ? "#94a3b8" : "#1d4ed8",
            color: "#fff", border: "none", borderRadius: 12,
            padding: "11px 22px",
            fontSize: 13, fontWeight: 700,
            cursor: loading || !url.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {loading ? (
            <>
              <span
                aria-hidden
                style={{
                  width: 12, height: 12, border: "2px solid #fff",
                  borderTopColor: "transparent", borderRadius: "50%",
                  animation: "ku-spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
              Import en cours…
            </>
          ) : (
            "Importer →"
          )}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "#b91c1c", margin: "10px 0 0", lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      <p style={{ fontSize: 11, color: "#8a8477", margin: "12px 0 0", lineHeight: 1.5 }}>
        <a href="/aide/import-annonce" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>
          Comment ça marche ?
        </a>
        {" · "}
        Données extraites uniquement depuis le lien que tu colles. Pas de scraping en masse.
      </p>

      <style>{`@keyframes ku-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
