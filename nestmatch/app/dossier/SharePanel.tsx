"use client"
import { useState } from "react"

/**
 * Panneau de partage : génère un lien sécurisé (7 jours) du dossier locataire.
 * Lien en lecture seule, sans authentification, stateless (HMAC).
 */
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
    <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Partager mon dossier</h3>
      <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, marginBottom: 14 }}>
        Génère un lien unique valable 7 jours. Toute personne ayant ce lien pourra consulter votre dossier en lecture seule, sans compte nécessaire.
      </p>

      {!url ? (
        <button onClick={generate} disabled={loading}
          style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Génération…" : "Générer un lien de partage"}
        </button>
      ) : (
        <>
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", border: "1px solid #e5e7eb" }}>
            <input readOnly value={url}
              onFocus={e => e.currentTarget.select()}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 12, color: "#111", outline: "none", fontFamily: "inherit", minWidth: 0 }} />
            <button onClick={copy}
              style={{ background: copied ? "#16a34a" : "#111", color: "white", border: "none", borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
            Expire le {exp}. Générer un nouveau lien invalidera celui-ci uniquement après son expiration.
          </p>
          <button onClick={() => { setUrl(null); setExpiresAt(null) }}
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 8, padding: 0, textDecoration: "underline", fontFamily: "inherit" }}>
            Générer un autre lien
          </button>
        </>
      )}

      {error && <p style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{error}</p>}
    </div>
  )
}
