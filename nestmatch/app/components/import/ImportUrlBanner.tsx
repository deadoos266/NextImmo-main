"use client"
import { useState, useEffect, useRef } from "react"
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

// V97.39.16 — Détection rapide hostname → si DataDome host, prévenir l'user
// que le fetch passe par le worker stealth (peut prendre jusqu'à 25s)
const DATADOME_HOSTS = ["leboncoin.fr", "seloger.com", "logic-immo.com"]
function isSlowHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "")
    return DATADOME_HOSTS.some(h => host === h || host.endsWith("." + h))
  } catch {
    return false
  }
}

// V97.39.16 — Messages rotatifs pendant le loading pour rassurer l'user
function loadingMessage(elapsedSec: number, slowHost: boolean): string {
  if (slowHost) {
    if (elapsedSec < 3) return "Connexion au site…"
    if (elapsedSec < 8) return "Extraction stealth en cours…"
    if (elapsedSec < 18) return "Résolution du challenge anti-bot…"
    return "Presque fini, patience…"
  }
  if (elapsedSec < 2) return "Récupération de la page…"
  if (elapsedSec < 5) return "Extraction des données…"
  return "Finalisation…"
}

export default function ImportUrlBanner({ onImported, onDismiss, initiallyDismissed = false }: Props) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(initiallyDismissed)
  // V97.39.16 — AbortController pour permettre Annuler
  const abortRef = useRef<AbortController | null>(null)

  // V97.39.16 — Tick elapsed toutes les secondes pendant loading
  useEffect(() => {
    if (!loading) {
      setElapsedSec(0)
      return
    }
    setElapsedSec(0)
    const t0 = Date.now()
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - t0) / 1000))
    }, 500)
    return () => clearInterval(interval)
  }, [loading])

  if (dismissed) return null

  function handleCancel() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setLoading(false)
    setError("Import annulé.")
  }

  async function handleImport() {
    const trimmed = url.trim()
    if (!trimmed) { setError("Colle d'abord un lien."); return }
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("L'URL doit commencer par https:// ou http://")
      return
    }
    setLoading(true); setError(null)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch("/api/proprio/annonce/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: ctrl.signal,
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
        abortRef.current = null
        return
      }
      onImported(j.data as ImportedAnnonce)
      setLoading(false)
      abortRef.current = null
    } catch (e) {
      // V97.39.16 — abort → message "Import annulé" déjà set par handleCancel
      if (e instanceof Error && e.name === "AbortError") return
      setError("Erreur réseau. Vérifie ta connexion et réessaie.")
      setLoading(false)
      abortRef.current = null
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
            minWidth: loading ? 220 : "auto",  // V97.39.16 — évite le saut de largeur quand le message change
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
                  flexShrink: 0,
                }}
              />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {loadingMessage(elapsedSec, isSlowHost(url))} {elapsedSec > 0 && `(${elapsedSec}s)`}
              </span>
            </>
          ) : (
            "Importer →"
          )}
        </button>
        {/* V97.39.16 — Bouton Annuler visible après 5s de loading */}
        {loading && elapsedSec >= 5 && (
          <button
            type="button"
            onClick={handleCancel}
            style={{
              background: "white", color: "#b91c1c",
              border: "1px solid #fca5a5", borderRadius: 12,
              padding: "11px 16px",
              fontSize: 12, fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
        )}
      </div>

      {/* V97.39.16 — Hint contextuel pendant loading sur sites DataDome */}
      {loading && isSlowHost(url) && elapsedSec < 25 && (
        <p style={{ fontSize: 11, color: "#1d4ed8", margin: "10px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
          ⏱ Ce site utilise une protection anti-bot. L&apos;extraction stealth peut prendre jusqu&apos;à 25 secondes.
        </p>
      )}

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
