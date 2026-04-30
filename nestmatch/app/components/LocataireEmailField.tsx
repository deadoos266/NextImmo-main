"use client"
import { useState, useEffect } from "react"

// IMPORTANT : ne PAS évaluer `typeof window` au module-level. Ça crée une
// constante différente entre SSR (fallback URL) et CSR (vraie origin), ce qui
// peut diverger entre les deux rendus. On résout l'URL au moment du clic,
// handler-side, où c'est systématiquement côté client.
const SITE_URL_FALLBACK = "https://keymatch-immo.fr"

export default function LocataireEmailField({
  value,
  onChange,
  inputStyle,
}: {
  value: string
  onChange: (email: string) => void
  inputStyle: any
}) {
  const [statut, setStatut] = useState<"idle" | "checking" | "found" | "not_found">("idle")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!value || !value.includes("@")) { setStatut("idle"); return }
    const timer = setTimeout(async () => {
      setStatut("checking")
      // V55.1 — server-side via /api/users/check-email (anti-scraping)
      try {
        const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(value.toLowerCase().trim())}`)
        const json = await res.json().catch(() => ({}))
        setStatut(json?.ok && json.exists ? "found" : "not_found")
      } catch {
        setStatut("not_found")
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [value])

  function copierInvitation() {
    const siteUrl = typeof window !== "undefined" ? window.location.origin : SITE_URL_FALLBACK
    const msg = `Bonjour,\n\nJe gere notre location sur KeyMatch. Pour acceder aux documents (etat des lieux, quittances, carnet d'entretien), inscrivez-vous avec l'adresse ${value} :\n\n${siteUrl}/auth\n\nA bientot sur KeyMatch !`
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", display: "block", marginBottom: 6 }}>Email du locataire</label>
      <input
        style={inputStyle}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="locataire@email.fr"
        type="email"
      />

      {/* Status badge */}
      {statut === "checking" && (
        <p style={{ fontSize: 11, color: "#8a8477", marginTop: 6 }}>Verification...</p>
      )}
      {statut === "found" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{ background: "#F0FAEE", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
            ✓ Compte KeyMatch trouve
          </span>
          <span style={{ fontSize: 11, color: "#15803d" }}>Tout sera connecte automatiquement</span>
        </div>
      )}
      {statut === "not_found" && value.includes("@") && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ background: "#FBF6EA", color: "#a16207", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
              Pas encore inscrit sur KeyMatch
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 10, lineHeight: 1.5 }}>
            Votre locataire pourra s'inscrire avec cette adresse email. Tout se connectera automatiquement (messages, EDL, quittances).
          </p>
          <button onClick={copierInvitation}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 16px", background: copied ? "#F0FAEE" : "#EEF3FB",
              border: `1px solid ${copied ? "#C6E9C0" : "#D7E3F4"}`,
              borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 700, color: copied ? "#15803d" : "#1d4ed8",
            }}>
            {copied ? "✓ Invitation copiee !" : "Copier le message d'invitation"}
          </button>
          <p style={{ fontSize: 11, color: "#8a8477", marginTop: 6 }}>
            Envoyez ce message par SMS, WhatsApp ou email a votre locataire
          </p>
        </div>
      )}
    </div>
  )
}
