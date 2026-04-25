"use client"
import { useEffect, useState } from "react"

interface AnnoncePreview {
  titre?: string | null
  ville?: string | null
  prix?: number | null
  surface?: number | null
  photos?: string[] | null
}

export interface VisiteSlot {
  date: string   // YYYY-MM-DD
  heure: string  // HH:MM
}

export type VisiteFormat = "physique" | "visio"

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Callback au submit. Le payload propose jusqu'à 5 créneaux (R10.8) +
   * un format global (physique / visio) pour la demande entière.
   * Le parent insère une visite DB (avec le 1er slot comme colonne primaire)
   * et fait voyager les autres créneaux + le format dans la carte message.
   */
  onConfirm: (p: { slots: VisiteSlot[]; message: string; format: VisiteFormat }) => Promise<void> | void
  /** Annonce concernée pour le rail preview. */
  annonce?: AnnoncePreview | null
  /** Si contre-proposition : libellé de la proposition qui va être annulée. */
  counterTargetLabel?: string | null
  /** Mode envoi en cours. */
  envoi?: boolean
  /** Badge compat % (optionnel) */
  matchPct?: number | null
  /** Pré-remplissage slot initial — utilisé en contre-proposition. */
  initialDate?: string | null
  initialHeure?: string | null
  /**
   * Si true, la modal s'affiche en mode "verrouillé" : message d'explication
   * "le proprio doit valider la candidature" au lieu du formulaire (Paul
   * 2026-04-25). Côté proprio cette prop est false ; côté locataire elle
   * vaut true tant que statut_candidature !== 'validee'.
   */
  locked?: boolean
}

const MAX_SLOTS = 5
const HEURES = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]

/**
 * Modale "Proposer une visite" — R10.8 multi-créneaux.
 *
 * Le propriétaire peut proposer de 1 à 5 créneaux. Le locataire choisira
 * ensuite lequel il retient (côté VisiteDemandeCard + choisirSlotVisite).
 * Le locataire (contre-proposition) peut aussi proposer jusqu'à 5 créneaux
 * — même UI, pas de branche.
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
  locked = false,
}: Props) {
  const [slots, setSlots] = useState<VisiteSlot[]>([{ date: "", heure: "10:00" }])
  const [message, setMessage] = useState("")
  const [format, setFormat] = useState<VisiteFormat>("physique")

  // Reset à chaque ouverture (pré-remplissage du 1er slot si initial* fournis).
  useEffect(() => {
    if (open) {
      setSlots([{ date: initialDate || "", heure: initialHeure || "10:00" }])
      setMessage("")
      setFormat("physique")
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

  const validSlots = slots.filter(s => s.date && s.heure)
  const canSubmit = !envoi && validSlots.length > 0
  const canAddSlot = slots.length < MAX_SLOTS
  const isCounter = !!counterTargetLabel
  const title = isCounter ? "Contre-proposer un ou plusieurs créneaux" : "Proposer jusqu'à 5 créneaux"

  const updateSlot = (i: number, patch: Partial<VisiteSlot>) =>
    setSlots(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const addSlot = () =>
    setSlots(prev => (prev.length >= MAX_SLOTS ? prev : [...prev, { date: "", heure: "10:00" }]))
  const removeSlot = (i: number) =>
    setSlots(prev => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    // On n'envoie que les slots valides (au moins 1 garanti par canSubmit).
    await onConfirm({ slots: validSlots, message: message.trim(), format })
  }

  const photo = Array.isArray(annonce?.photos) && annonce!.photos!.length > 0 ? annonce!.photos![0] : null
  const matchColor = typeof matchPct === "number"
    ? (matchPct >= 80 ? "#15803d" : matchPct >= 60 ? "#a16207" : "#b91c1c")
    : "#8a8477"

  const minDate = new Date().toISOString().split("T")[0]

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
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px", borderBottom: "1px solid #EAE6DF",
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#8a8477",
            textTransform: "uppercase", letterSpacing: "1.4px",
          }}>
            {isCounter ? "Contre-proposition" : "Demande de visite"}
          </span>
          <button
            onClick={onClose}
            aria-label="Fermer"
            type="button"
            style={{
              width: 32, height: 32, borderRadius: "50%", border: "none",
              background: "#F7F4EF", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "#111",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Preview rail de l'annonce */}
        {annonce && (
          <div style={{
            display: "flex", gap: 12, padding: "14px 24px",
            background: "#F7F4EF", borderBottom: "1px solid #EAE6DF", alignItems: "center",
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: photo ? `url(${photo}) center/cover` : "#EAE6DF",
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: "#111",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
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

        {/* Mode verrouillé : candidature pas encore validée par le proprio */}
        {locked && (
          <div style={{ flex: 1, padding: "32px 28px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FBF6EA", color: "#a16207", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
              Candidature en attente
            </p>
            <h2 className="km-visite-serif" style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.4px", margin: 0, color: "#111", lineHeight: 1.25 }}>
              Le propriétaire doit d&apos;abord valider votre candidature
            </h2>
            <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.6 }}>
              Tant que votre candidature n&apos;a pas été validée, vous ne pouvez pas proposer de créneau. Le propriétaire reçoit votre dossier — vous serez notifié dès qu&apos;il valide votre candidature.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: "10px 20px", background: "#111", color: "#fff", border: "none", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                Compris
              </button>
            </div>
          </div>
        )}

        {/* Body normal (formulaire de demande) — masqué si locked */}
        {!locked && (
        <form onSubmit={submit} style={{
          flex: 1, overflowY: "auto", padding: "24px 24px 8px",
          display: "flex", flexDirection: "column", gap: 18,
        }}>
          <div>
            <h2
              id="proposer-visite-title"
              className="km-visite-serif"
              style={{
                fontSize: 26, fontWeight: 500, letterSpacing: "-0.5px",
                margin: 0, marginBottom: 6, color: "#111",
              }}
            >
              {title}
            </h2>
            <p style={{ fontSize: 13, color: "#6b6b6b", margin: 0, lineHeight: 1.55 }}>
              {isCounter
                ? <>La proposition initiale (<strong style={{ color: "#111" }}>{counterTargetLabel}</strong>) sera annulée. Vous pouvez proposer un ou plusieurs créneaux de remplacement.</>
                : "Ajoutez jusqu'à 5 créneaux. Le candidat en choisira un — les autres seront automatiquement rejetés."}
            </p>
          </div>

          {/* Sélecteur format : sur place vs visio (Paul 2026-04-25) */}
          <div>
            <label style={{
              fontSize: 10, fontWeight: 700, color: "#8a8477",
              textTransform: "uppercase", letterSpacing: "1.2px",
              display: "block", marginBottom: 8,
            }}>
              Format
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {([
                { v: "physique" as const, label: "Sur place", desc: "Visite physique du bien" },
                { v: "visio" as const, label: "En visio", desc: "Appel vidéo à distance" },
              ]).map(opt => {
                const active = format === opt.v
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setFormat(opt.v)}
                    aria-pressed={active}
                    style={{
                      padding: "10px 14px", minHeight: 56,
                      borderRadius: 12,
                      border: active ? "2px solid #111" : "1px solid #EAE6DF",
                      background: active ? "#111" : "#fff",
                      color: active ? "#fff" : "#111",
                      cursor: "pointer", fontFamily: "inherit",
                      textAlign: "left",
                      display: "flex", flexDirection: "column", gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{opt.label}</span>
                    <span style={{ fontSize: 11, opacity: active ? 0.85 : 0.6 }}>{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Liste des slots */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {slots.map((slot, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-end",
                background: "#FBF9F5", border: "1px solid #EAE6DF", borderRadius: 14, padding: 12,
              }}>
                <div style={{ flex: 2 }}>
                  <label style={{
                    fontSize: 9.5, fontWeight: 700, color: "#8a8477",
                    textTransform: "uppercase", letterSpacing: "1.2px",
                    display: "block", marginBottom: 5,
                  }}>
                    Créneau {i + 1} — Date
                  </label>
                  <input
                    type="date"
                    min={minDate}
                    value={slot.date}
                    onChange={e => updateSlot(i, { date: e.target.value })}
                    autoFocus={i === 0}
                    style={{
                      width: "100%", padding: "10px 12px",
                      border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13.5,
                      fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                      background: "#fff", color: "#111",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#111" }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#EAE6DF" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{
                    fontSize: 9.5, fontWeight: 700, color: "#8a8477",
                    textTransform: "uppercase", letterSpacing: "1.2px",
                    display: "block", marginBottom: 5,
                  }}>
                    Heure
                  </label>
                  <select
                    value={slot.heure}
                    onChange={e => updateSlot(i, { heure: e.target.value })}
                    style={{
                      width: "100%", padding: "10px 12px",
                      border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13.5,
                      fontFamily: "inherit", outline: "none",
                      background: "#fff", color: "#111",
                      cursor: "pointer", boxSizing: "border-box",
                    }}
                  >
                    {HEURES.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(i)}
                    aria-label={`Supprimer le créneau ${i + 1}`}
                    style={{
                      width: 36, height: 36, borderRadius: "50%", border: "1px solid #EAE6DF",
                      background: "#fff", cursor: "pointer", color: "#8a8477",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            ))}
            {canAddSlot && (
              <button
                type="button"
                onClick={addSlot}
                style={{
                  padding: "10px 14px", borderRadius: 12, border: "1.5px dashed #EAE6DF",
                  background: "transparent", cursor: "pointer", color: "#111",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 600, letterSpacing: "0.2px",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Ajouter un créneau {slots.length < MAX_SLOTS && <span style={{ color: "#8a8477", fontWeight: 400 }}>({slots.length}/{MAX_SLOTS})</span>}
              </button>
            )}
          </div>

          {/* Message */}
          <div>
            <label style={{
              fontSize: 10, fontWeight: 700, color: "#8a8477",
              textTransform: "uppercase", letterSpacing: "1.2px",
              display: "block", marginBottom: 6,
            }}>
              Message (optionnel)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Ex : je peux m'adapter sur un autre créneau, parking disponible devant l'immeuble…"
              rows={3}
              style={{
                width: "100%", padding: "12px 14px",
                border: "1px solid #EAE6DF", borderRadius: 12,
                fontSize: 13.5, lineHeight: 1.55, fontFamily: "inherit",
                outline: "none", resize: "vertical", boxSizing: "border-box",
                background: "#F7F4EF", color: "#111",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "#111"; e.currentTarget.style.background = "#fff" }}
              onBlur={e => { e.currentTarget.style.borderColor = "#EAE6DF"; e.currentTarget.style.background = "#F7F4EF" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 10px", borderRadius: 999, background: "#F7F4EF",
              fontSize: 11, color: "#6b6b6b", fontWeight: 500,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Réponse sous 24 h en moyenne
            </span>
          </div>
        </form>
        )}

        {/* Footer (formulaire normal uniquement — locked a son propre footer) */}
        {!locked && (
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10,
          padding: "16px 24px", borderTop: "1px solid #EAE6DF", background: "#fff",
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={envoi}
            style={{
              padding: "11px 20px", background: "#fff", color: "#111",
              border: "1px solid #EAE6DF", borderRadius: 999,
              fontSize: 13, fontWeight: 500,
              cursor: envoi ? "not-allowed" : "pointer",
              fontFamily: "inherit", opacity: envoi ? 0.6 : 1,
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
              border: "none", borderRadius: 999,
              fontSize: 13, fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontFamily: "inherit", letterSpacing: "0.2px",
              transition: "background 200ms ease",
            }}
          >
            {envoi
              ? "Envoi…"
              : validSlots.length > 1
                ? `Envoyer ${validSlots.length} créneaux`
                : (isCounter ? "Envoyer la contre-proposition" : "Envoyer la demande")}
          </button>
        </div>
        )}
      </div>
    </>
  )
}
