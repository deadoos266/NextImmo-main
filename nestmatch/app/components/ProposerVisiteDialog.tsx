"use client"
import { useEffect, useState } from "react"

interface AnnoncePreview {
  titre?: string | null
  ville?: string | null
  prix?: number | null
  surface?: number | null
  photos?: string[] | null
}

interface Props {
  open: boolean
  onClose: () => void
  /** Callback au submit. Parent gère l'async + la fermeture sur succès. */
  onConfirm: (p: { date: string; heure: string; message: string }) => Promise<void> | void
  /** Annonce concernée pour le rail preview. Optionnel (fallback neutre). */
  annonce?: AnnoncePreview | null
  /** Si contre-proposition : libellé de la proposition qui va être annulée. */
  counterTargetLabel?: string | null
  /** Mode envoi en cours — parent contrôle pour afficher "Envoi…". */
  envoi?: boolean
  /** Badge compat % (optionnel) */
  matchPct?: number | null
  /** Pré-remplissage date (contre-proposition notamment). Format YYYY-MM-DD. */
  initialDate?: string | null
  /** Pré-remplissage heure. Format HH:MM. */
  initialHeure?: string | null
}

/**
 * Modale "Proposer une visite" — calque handoff modals.jsx VisitRequestModal.
 *
 * Design editorial : overlay noir + blur, card 24px radius, Fraunces italic
 * pour le titre principal, preview rail annonce, champs date/heure en ligne,
 * textarea message, CTA noir rond.
 *
 * La logique API reste 100% dans le parent (proposerVisite) — ce composant
 * est purement UI + validation basique. Le parent décide quand fermer.
 */
export default function ProposerVisiteDialog({
  open,
  onClose,
  onConfirm,
  annonce,
  counterTargetLabel,
  envoi,
  matchPct,
  initialDate,
  initialHeure,
}: Props) {
  const [date, setDate] = useState("")
  const [heure, setHeure] = useState("10:00")
  const [message, setMessage] = useState("")

  // Reset à chaque ouverture — avec pré-remplissage si initial* fournis
  // (contre-proposition : la modale démarre sur l'ancienne date/heure
  // pour que le user n'ait qu'à bouger d'un cran).
  useEffect(() => {
    if (open) {
      setDate(initialDate || "")
      setHeure(initialHeure || "10:00")
      setMessage("")
    }
  }, [open, initialDate, initialHeure])

  // ESC ferme
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const canSubmit = !envoi && !!date && !!heure
  const isCounter = !!counterTargetLabel
  const title = isCounter ? "Contre-proposer un créneau" : "Proposer une visite"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    await onConfirm({ date, heure, message: message.trim() })
  }

  const photo = Array.isArray(annonce?.photos) && annonce!.photos!.length > 0 ? annonce!.photos![0] : null
  const matchColor = typeof matchPct === "number"
    ? (matchPct >= 80 ? "#16a34a" : matchPct >= 60 ? "#ea580c" : "#dc2626")
    : "#8a8477"

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,400;1,9..144,500&display=swap');
        @keyframes km-visite-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes km-visite-rise { from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)) } to { opacity: 1; transform: translate(-50%, -50%) } }
        .km-visite-serif { font-family: 'Fraunces', Georgia, serif; font-style: italic; }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,17,17,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 9000,
          animation: "km-visite-fade 180ms ease",
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposer-visite-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: 24,
          width: "min(560px, 94vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(17,17,17,0.24)",
          zIndex: 9001,
          fontFamily: "'DM Sans', sans-serif",
          animation: "km-visite-rise 240ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {/* Header — eyebrow + close */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 24px",
          borderBottom: "1px solid #EAE6DF",
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#8a8477",
            textTransform: "uppercase",
            letterSpacing: "1.4px",
          }}>
            {isCounter ? "Contre-proposition" : "Demande de visite"}
          </span>
          <button
            onClick={onClose}
            aria-label="Fermer"
            type="button"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "#F7F4EF",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#111",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Preview rail de l'annonce */}
        {annonce && (
          <div style={{
            display: "flex",
            gap: 12,
            padding: "14px 24px",
            background: "#F7F4EF",
            borderBottom: "1px solid #EAE6DF",
            alignItems: "center",
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: photo ? `url(${photo}) center/cover` : "#EAE6DF",
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#111",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                letterSpacing: "-0.1px",
              }}>
                {annonce.titre || "Annonce"}
              </div>
              <div style={{ fontSize: 11, color: "#8a8477", marginTop: 2 }}>
                {[annonce.ville, annonce.prix ? `${annonce.prix} €` : null, annonce.surface ? `${annonce.surface} m²` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            {typeof matchPct === "number" && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: matchColor, letterSpacing: "0.8px" }}>COMPATIBILITÉ</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: matchColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{matchPct}%</div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <form onSubmit={submit} style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 24px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}>
          <div>
            <h2
              id="proposer-visite-title"
              className="km-visite-serif"
              style={{
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: "-0.5px",
                margin: 0,
                marginBottom: 6,
                color: "#111",
              }}
            >
              {title}
            </h2>
            <p style={{ fontSize: 13, color: "#6b6b6b", margin: 0, lineHeight: 1.55 }}>
              {isCounter
                ? <>La proposition initiale (<strong style={{ color: "#111" }}>{counterTargetLabel}</strong>) sera annulée et remplacée par votre nouveau créneau.</>
                : "Le propriétaire doit valider votre créneau — réponse sous 24 h en moyenne."}
            </p>
          </div>

          {/* Date + Heure */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#8a8477",
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                display: "block",
                marginBottom: 6,
              }}>
                Date
              </label>
              <input
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={date}
                onChange={e => setDate(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid #EAE6DF",
                  borderRadius: 12,
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#fff",
                  color: "#111",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#111" }}
                onBlur={e => { e.currentTarget.style.borderColor = "#EAE6DF" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#8a8477",
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                display: "block",
                marginBottom: 6,
              }}>
                Heure
              </label>
              <select
                value={heure}
                onChange={e => setHeure(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid #EAE6DF",
                  borderRadius: 12,
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                  background: "#fff",
                  color: "#111",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                {["08:00","09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"].map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Message */}
          <div>
            <label style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#8a8477",
              textTransform: "uppercase",
              letterSpacing: "1.2px",
              display: "block",
              marginBottom: 6,
            }}>
              Message (optionnel)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Ex : je suis très intéressé, mon dossier est complet, je peux m'adapter sur un autre créneau…"
              rows={4}
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid #EAE6DF",
                borderRadius: 12,
                fontSize: 13.5,
                lineHeight: 1.55,
                fontFamily: "inherit",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                background: "#F7F4EF",
                color: "#111",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "#111"; e.currentTarget.style.background = "#fff" }}
              onBlur={e => { e.currentTarget.style.borderColor = "#EAE6DF"; e.currentTarget.style.background = "#F7F4EF" }}
            />
          </div>

          {/* Info pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 999,
              background: "#F7F4EF",
              fontSize: 11,
              color: "#6b6b6b",
              fontWeight: 500,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Identité vérifiée
            </span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 999,
              background: "#F7F4EF",
              fontSize: 11,
              color: "#6b6b6b",
              fontWeight: 500,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Réponse sous 24 h en moyenne
            </span>
          </div>
        </form>

        {/* Footer */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          padding: "16px 24px",
          borderTop: "1px solid #EAE6DF",
          background: "#fff",
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={envoi}
            style={{
              padding: "11px 20px",
              background: "#fff",
              color: "#111",
              border: "1px solid #EAE6DF",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              cursor: envoi ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: envoi ? 0.6 : 1,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: "11px 24px",
              background: canSubmit ? "#111" : "#EAE6DF",
              color: canSubmit ? "#fff" : "#8a8477",
              border: "none",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              letterSpacing: "0.2px",
              transition: "background 200ms ease",
            }}
          >
            {envoi ? "Envoi…" : (isCounter ? "Envoyer la contre-proposition" : "Envoyer la demande")}
          </button>
        </div>
      </div>
    </>
  )
}
