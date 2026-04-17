"use client"
import { useState, useEffect } from "react"

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (motif: string) => Promise<void> | void
  /** "annulation" (visite confirmée) ou "refus" (proposition en attente) */
  mode?: "annulation" | "refus"
  /** Exigence : motif obligatoire (défaut : true en annulation, false en refus) */
  motifRequis?: boolean
}

/**
 * Modale d'annulation de visite. Recueille un motif puis lance le callback.
 * L'autre partie recevra un message automatique dans la conv.
 */
export default function AnnulerVisiteDialog({ open, onClose, onConfirm, mode = "annulation", motifRequis }: Props) {
  const [motif, setMotif] = useState("")
  const [loading, setLoading] = useState(false)
  const requis = motifRequis ?? (mode === "annulation")

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setMotif("")
      setLoading(false)
    }
  }, [open])

  // ESC pour fermer
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const title = mode === "annulation" ? "Annuler cette visite ?" : "Refuser cette demande de visite ?"
  const placeholder = mode === "annulation"
    ? "Ex : empêchement, bien déjà loué, changement de planning…"
    : "Optionnel — créneau non disponible, bien déjà attribué…"
  const cta = mode === "annulation" ? "Annuler la visite" : "Refuser la visite"

  const canSubmit = !loading && (!requis || motif.trim().length > 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    try {
      await onConfirm(motif.trim())
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 2000,
        }}
      />
      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="annuler-visite-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "white",
          borderRadius: 20,
          padding: 28,
          width: "min(480px, 92vw)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          zIndex: 2001,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <h2 id="annuler-visite-title" style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.3px" }}>
          {title}
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
          {mode === "annulation"
            ? "L'autre partie recevra un message dans la conversation avec le motif."
            : "Vous pouvez laisser un motif qui sera partagé dans la conversation."}
        </p>

        <form onSubmit={submit}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>
            Motif {requis && <span style={{ color: "#dc2626" }}>*</span>}
          </label>
          <textarea
            value={motif}
            onChange={e => setMotif(e.target.value)}
            placeholder={placeholder}
            rows={4}
            autoFocus
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1.5px solid #e5e7eb",
              borderRadius: 12,
              fontSize: 14,
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
              color: "#111",
              background: "white",
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                background: "white",
                border: "1.5px solid #e5e7eb",
                color: "#111",
                borderRadius: 999,
                padding: "10px 22px",
                fontWeight: 700,
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Retour
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                background: canSubmit ? "#dc2626" : "#e5e7eb",
                color: canSubmit ? "white" : "#9ca3af",
                border: "none",
                borderRadius: 999,
                padding: "10px 22px",
                fontWeight: 700,
                fontSize: 14,
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {loading ? "Envoi…" : cta}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
