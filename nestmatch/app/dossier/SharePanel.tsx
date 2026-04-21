"use client"
import { useState } from "react"

/**
 * Panneau de partage : génère un lien sécurisé (7 jours) du dossier locataire.
 * Lien en lecture seule, sans authentification, stateless (HMAC).
 */

const T = {
  white: "#fff",
  ink: "#111",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
  success: "#16a34a",
  danger: "#dc2626",
}

export default function SharePanel() {
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  async function generate() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/dossier/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || "Impossible de générer le lien.")
        setLoading(false)
        return
      }
      setUrl(json.url)
      setExpiresAt(json.expiresAt)
    } catch {
      setError("Erreur réseau. Veuillez réessayer.")
    }
    setLoading(false)
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* noop */ }
  }

  const exp = expiresAt ? new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null

  return (
    <div style={{ background: T.white, borderRadius: 20, padding: 28, marginBottom: 16, border: `1px solid ${T.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: T.soft }}>
          Partage
        </span>
        <div style={{ flex: 1, height: 1, background: T.hairline }} />
      </div>

      <h3 style={{ fontSize: 22, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.4px", margin: "0 0 10px", color: T.ink, lineHeight: 1.15 }}>
        Partager mon dossier
      </h3>
      <p style={{ fontSize: 13, color: T.meta, lineHeight: 1.6, marginBottom: 18 }}>
        Génère un lien unique valable 7 jours. Toute personne ayant ce lien pourra consulter votre dossier en lecture seule, sans compte nécessaire.
      </p>

      {!url ? (
        <button onClick={generate} disabled={loading}
          style={{ background: T.ink, color: T.white, border: "none", borderRadius: 999, padding: "11px 22px", fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1, letterSpacing: "0.3px" }}>
          {loading ? "Génération…" : "Générer un lien de partage"}
        </button>
      ) : (
        <>
          <div style={{ background: T.mutedBg, borderRadius: 12, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", border: `1px solid ${T.hairline}` }}>
            <input readOnly value={url}
              onFocus={e => e.currentTarget.select()}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 12, color: T.ink, outline: "none", fontFamily: "inherit", minWidth: 0 }} />
            <button onClick={copy}
              style={{ background: copied ? T.success : T.ink, color: T.white, border: "none", borderRadius: 999, padding: "6px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: T.soft, marginTop: 10, lineHeight: 1.5 }}>
            Expire le {exp}. Générer un nouveau lien invalidera celui-ci uniquement après son expiration.
          </p>
          <button onClick={() => { setUrl(null); setExpiresAt(null) }}
            style={{ background: "none", border: "none", color: T.meta, fontSize: 12, fontWeight: 500, cursor: "pointer", marginTop: 4, padding: 0, textDecoration: "underline", fontFamily: "inherit" }}>
            Générer un autre lien
          </button>
        </>
      )}

      {error && <p style={{ color: T.danger, fontSize: 12, marginTop: 10 }}>{error}</p>}
    </div>
  )
}
