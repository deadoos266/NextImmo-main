"use client"
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"

const SITE_URL = typeof window !== "undefined" ? window.location.origin : "https://keymatch-immo.fr"

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
      const { count } = await supabase.from("users").select("id", { count: "exact", head: true }).eq("email", value.toLowerCase().trim())
      setStatut((count ?? 0) > 0 ? "found" : "not_found")
    }, 600)
    return () => clearTimeout(timer)
  }, [value])

  function copierInvitation() {
    const msg = `Bonjour,\n\nJe gere notre location sur KeyMatch. Pour acceder aux documents (etat des lieux, quittances, carnet d'entretien), inscrivez-vous avec l'adresse ${value} :\n\n${SITE_URL}/auth\n\nA bientot sur KeyMatch !`
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Email du locataire</label>
      <input
        style={inputStyle}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="locataire@email.fr"
        type="email"
      />

      {/* Status badge */}
      {statut === "checking" && (
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>Verification...</p>
      )}
      {statut === "found" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
            ✓ Compte KeyMatch trouve
          </span>
          <span style={{ fontSize: 11, color: "#16a34a" }}>Tout sera connecte automatiquement</span>
        </div>
      )}
      {statut === "not_found" && value.includes("@") && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ background: "#fff7ed", color: "#ea580c", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
              Pas encore inscrit sur KeyMatch
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
            Votre locataire pourra s'inscrire avec cette adresse email. Tout se connectera automatiquement (messages, EDL, quittances).
          </p>
          <button onClick={copierInvitation}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 16px", background: copied ? "#dcfce7" : "#eff6ff",
              border: `1.5px solid ${copied ? "#bbf7d0" : "#bfdbfe"}`,
              borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 700, color: copied ? "#16a34a" : "#1d4ed8",
            }}>
            {copied ? "✓ Invitation copiee !" : "Copier le message d'invitation"}
          </button>
          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
            Envoyez ce message par SMS, WhatsApp ou email a votre locataire
          </p>
        </div>
      )}
    </div>
  )
}
