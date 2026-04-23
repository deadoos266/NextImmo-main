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
 * Modale d'annulation / refus de visite — calque handoff modals.jsx pattern
 * (overlay blur + card radius 24 beige hairline, title Fraunces, inputs
 * fond beige F7F4EF, CTA pill noir).
 *
 * Recueille un motif puis lance le callback. L'autre partie recevra un
 * message automatique dans la conv.
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

  const eyebrow = mode === "annulation" ? "Annulation" : "Refus"
  const title = mode === "annulation" ? "Annuler cette visite ?" : "Refuser cette demande ?"
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      {/* Backdrop — overlay editorial blur, calque handoff */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,17,17,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 9000,
        }}
      />
      {/* Modal — card radius 24 + hairline beige, titre Fraunces italic */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="annuler-visite-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          border: "1px solid #EAE6DF",
          borderRadius: 24,
          padding: "28px 32px",
          width: "min(480px, 92vw)",
          boxShadow: "0 20px 60px rgba(17,17,17,0.18)",
          zIndex: 9001,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>
          {eyebrow}
        </p>
        <h2
          id="annuler-visite-title"
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 24,
            lineHeight: 1.15,
            letterSpacing: "-0.4px",
            color: "#111",
            margin: "0 0 10px",
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.6, margin: "0 0 22px" }}>
          {mode === "annulation"
            ? "L'autre partie recevra un message dans la conversation avec le motif."
            : "Vous pouvez laisser un motif — il sera partagé dans la conversation."}
        </p>

        <form onSubmit={submit}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1.4px", display: "block", marginBottom: 8 }}>
            Motif {requis && <span style={{ color: "#b91c1c" }}>*</span>}
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
              border: "1px solid #EAE6DF",
              borderRadius: 14,
              fontSize: 13.5,
              lineHeight: 1.55,
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
              color: "#111",
              background: "#F7F4EF",
              transition: "border-color 200ms ease, background 200ms ease",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = "#111"; e.currentTarget.style.background = "#fff" }}
            onBlur={e => { e.currentTarget.style.borderColor = "#EAE6DF"; e.currentTarget.style.background = "#F7F4EF" }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                background: "#fff",
                border: "1px solid #EAE6DF",
                color: "#111",
                borderRadius: 999,
                padding: "11px 22px",
                fontWeight: 600,
                fontSize: 12,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.3px",
              }}
            >
              Retour
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                background: canSubmit ? "#111" : "#EAE6DF",
                color: canSubmit ? "#fff" : "#8a8477",
                border: "none",
                borderRadius: 999,
                padding: "11px 22px",
                fontWeight: 600,
                fontSize: 12,
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                letterSpacing: "0.3px",
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
