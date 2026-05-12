"use client"
import { useEffect, useState } from "react"

/**
 * V97.35 P3-3 — Modale de saisie de review.
 *
 * Affiche :
 *  - 1 question score global (étoiles 1-5)
 *  - 4 sous-critères (étoiles 1-5) selon le rôle (locataire ou proprio)
 *  - Champ commentaire libre 1500 chars max
 *
 * Submit → POST /api/reviews. Affiche succès + ferme.
 *
 * Le rôle est passé en prop (déterminé par le caller via l'endpoint
 * /api/reviews/eligibility).
 */

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  annonce_id: number
  role: "locataire" | "proprietaire"
  target_email: string
  bien_titre?: string | null
  bien_ville?: string | null
}

const SUBSCORES_LABEL: Record<string, Record<string, string>> = {
  locataire: {
    reactivite: "Réactivité aux demandes",
    transparence: "Transparence et honnêteté",
    etat_logement: "État du logement à l'entrée",
    equite: "Équité et respect du bail",
  },
  proprietaire: {
    paiement_ponctuel: "Paiement des loyers à l'heure",
    respect_logement: "Respect du logement",
    communication: "Qualité de la communication",
    voisinage: "Respect du voisinage",
  },
}

function StarInput({ value, onChange, size = 24 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: size,
            color: n <= value ? "#fbbf24" : "#d4d4d4",
            padding: 0,
            lineHeight: 1,
            fontFamily: "inherit",
          }}
          aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function ReviewModal({
  open, onClose, onSuccess,
  annonce_id, role, target_email,
  bien_titre, bien_ville,
}: Props) {
  const [scoreGlobal, setScoreGlobal] = useState(0)
  const [subscores, setSubscores] = useState<Record<string, number>>({})
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ published: boolean } | null>(null)

  useEffect(() => {
    if (!open) {
      setScoreGlobal(0); setSubscores({}); setComment("")
      setSubmitting(false); setError(null); setSuccess(null)
    }
  }, [open])

  if (!open) return null

  const subscoresLabels = SUBSCORES_LABEL[role] || {}
  const targetLabel = role === "locataire" ? "le propriétaire" : "le locataire"

  async function submit() {
    if (scoreGlobal < 1) { setError("Note globale obligatoire"); return }
    setSubmitting(true); setError(null)
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annonce_id,
          score_global: scoreGlobal,
          score_details: subscores,
          comment: comment.trim() || null,
        }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        setError(j.error || "Erreur lors de l'envoi")
        setSubmitting(false)
        return
      }
      setSuccess({ published: j.published === true })
      setSubmitting(false)
    } catch {
      setError("Erreur réseau")
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, background: "rgba(17,17,17,0.6)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 20, maxWidth: 560, width: "100%",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}>
        <div style={{ padding: "24px 28px 0" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>
            Laisser un avis sur {targetLabel}
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: "8px 0 4px", color: "#111", fontFamily: "var(--font-fraunces), serif" }}>
            {target_email}
          </h2>
          {(bien_titre || bien_ville) && (
            <p style={{ fontSize: 13, color: "#3f3c37", margin: "0 0 16px", lineHeight: 1.5 }}>
              {bien_titre}{bien_ville ? ` · ${bien_ville}` : ""}
            </p>
          )}
        </div>

        {success ? (
          <div style={{ padding: "12px 28px 28px" }}>
            <div style={{
              background: "#dcfce7", border: "1px solid #86efac",
              borderRadius: 14, padding: "16px 18px",
            }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#166534", margin: 0 }}>
                Avis enregistré
              </p>
              <p style={{ fontSize: 13, color: "#15803d", margin: "6px 0 0", lineHeight: 1.5 }}>
                {success.published
                  ? "Les 2 avis sont maintenant visibles publiquement (double-aveugle débloqué)."
                  : "Votre avis sera publié dès que l'autre partie aura laissé le sien, ou automatiquement sous 7 jours."}
              </p>
            </div>
            <button
              onClick={() => { onSuccess?.(); onClose() }}
              style={{
                marginTop: 16, background: "#111", color: "#fff",
                border: "none", borderRadius: 999, padding: "10px 22px",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.5px",
              }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: "8px 28px 0" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", marginTop: 16, marginBottom: 8 }}>
                Note globale
              </p>
              <StarInput value={scoreGlobal} onChange={setScoreGlobal} size={32} />
            </div>

            <div style={{ padding: "0 28px", marginTop: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 10 }}>
                Critères détaillés (facultatif)
              </p>
              {Object.entries(subscoresLabels).map(([key, label]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EAE0" }}>
                  <span style={{ fontSize: 13, color: "#3f3c37" }}>{label}</span>
                  <StarInput value={subscores[key] || 0} onChange={v => setSubscores(s => ({ ...s, [key]: v }))} size={18} />
                </div>
              ))}
            </div>

            <div style={{ padding: "16px 28px 0" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 8 }}>
                Commentaire (facultatif)
              </p>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 1500))}
                rows={5}
                placeholder="Votre expérience en quelques mots…"
                style={{
                  width: "100%", padding: "10px 12px",
                  border: "1px solid #EAE6DF", borderRadius: 12,
                  fontSize: 14, fontFamily: "inherit", outline: "none",
                  resize: "vertical", boxSizing: "border-box",
                  color: "#111", background: "#fff",
                  lineHeight: 1.5,
                }}
              />
              <p style={{ fontSize: 11, color: "#8a8477", textAlign: "right", margin: "4px 0 0" }}>
                {comment.length}/1500
              </p>
            </div>

            {error && (
              <div style={{ margin: "12px 28px 0", padding: "10px 14px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10 }}>
                <p style={{ fontSize: 12, color: "#991b1b", margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ padding: "20px 28px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, borderTop: "1px solid #F0EAE0" }}>
              <p style={{ fontSize: 11, color: "#8a8477", margin: 0, lineHeight: 1.4, maxWidth: 260 }}>
                Votre avis sera visible dès que l'autre partie aura aussi soumis le sien.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  style={{
                    background: "#fff", color: "#111",
                    border: "1px solid #EAE6DF", borderRadius: 999,
                    padding: "10px 18px", fontSize: 11, fontWeight: 700,
                    cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                    textTransform: "uppercase", letterSpacing: "0.3px",
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || scoreGlobal < 1}
                  style={{
                    background: scoreGlobal < 1 ? "#d4d4d4" : "#111",
                    color: "#fff", border: "none", borderRadius: 999,
                    padding: "10px 22px", fontSize: 11, fontWeight: 700,
                    cursor: submitting || scoreGlobal < 1 ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    textTransform: "uppercase", letterSpacing: "0.3px",
                  }}
                >
                  {submitting ? "Envoi…" : "Envoyer l'avis"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
