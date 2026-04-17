"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { RAISONS } from "../../lib/signalements"

/**
 * Bouton "Signaler" + modale de signalement.
 * Usage : <SignalerButton type="annonce" targetId={String(annonce.id)} />
 */
interface Props {
  type: "annonce" | "message" | "user"
  targetId: string
  label?: string
  compact?: boolean
}

export default function SignalerButton({ type, targetId, label = "Signaler", compact = false }: Props) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [raison, setRaison] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setRaison("")
      setDescription("")
      setError("")
      setDone(false)
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  if (!session) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!raison) { setError("Sélectionnez un motif"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/signalements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, target_id: targetId, raison, description: description.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || "Erreur lors de l'envoi")
        setLoading(false)
        return
      }
      setDone(true)
      setTimeout(() => setOpen(false), 1800)
    } catch {
      setError("Erreur réseau. Veuillez réessayer.")
      setLoading(false)
    }
  }

  const btnStyle: React.CSSProperties = compact
    ? { background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "inherit" }
    : { background: "white", border: "1.5px solid #e5e7eb", color: "#6b7280", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }

  return (
    <>
      <button onClick={() => setOpen(true)} style={btnStyle} aria-label={label}>
        {label}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000 }} />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "white",
              borderRadius: 20,
              padding: 28,
              width: "min(520px, 92vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              zIndex: 2001,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {done ? (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#15803d" }}>Signalement envoyé</h2>
                <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                  Merci. Notre équipe de modération va examiner votre signalement et prendra les mesures appropriées.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.3px" }}>Signaler ce contenu</h2>
                <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
                  Votre signalement est confidentiel. Il sera examiné par notre équipe.
                </p>

                <form onSubmit={submit}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 8 }}>
                    Motif <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                    {RAISONS.map(r => (
                      <label key={r.code} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", border: `1.5px solid ${raison === r.code ? "#111" : "#e5e7eb"}`, borderRadius: 12, cursor: "pointer", background: raison === r.code ? "#f9fafb" : "white" }}>
                        <input type="radio" name="raison" value={r.code} checked={raison === r.code} onChange={() => setRaison(r.code)} style={{ marginTop: 3 }} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{r.label}</p>
                          <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0", lineHeight: 1.4 }}>{r.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>
                    Détails (optionnel)
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Donnez des détails pour aider notre équipe à comprendre..."
                    rows={3}
                    maxLength={1000}
                    style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: 14, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", color: "#111", background: "white" }}
                  />

                  {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{error}</p>}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                    <button type="button" onClick={() => setOpen(false)} disabled={loading}
                      style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                      Annuler
                    </button>
                    <button type="submit" disabled={loading || !raison}
                      style={{ background: loading || !raison ? "#e5e7eb" : "#dc2626", color: loading || !raison ? "#9ca3af" : "white", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: loading || !raison ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {loading ? "Envoi…" : "Envoyer le signalement"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
