"use client"
/**
 * V58.1 — Modale "Terminer + Relouer ce bien"
 *
 * Affichée quand le proprio clique "Relouer" sur une card de l'onglet
 * "Locataires" pour un bail dont la fin est officiellement actée
 * (préavis échu OU bail_termine_at posé manuellement).
 *
 * Effets via POST /api/baux/relouer :
 *   1. Archive le bail dans historique_baux (snapshot complet)
 *   2. Reset annonces.statut → "disponible" (republiée auto)
 *   3. Insert anciens_logements côté locataire
 *
 * UX :
 *   - Confirme l'action (irréversible)
 *   - Pré-sélectionne `finMotif` selon b.preavis_donne_par si dispo
 *   - Champ libre pour `finMotifDetail` (max 500 chars)
 *   - Bouton "Confirmer" → POST + toast + onSuccess (reload parent)
 */

import { useEffect, useState } from "react"

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  annonce: {
    id: number
    titre: string | null
    ville: string | null
    locataire_email: string | null
    preavis_donne_par?: string | null  // "locataire" | "proprietaire" | null
  }
}

type FinMotif = "preavis_locataire" | "preavis_bailleur" | "fin_terme" | "accord_amiable"

const MOTIF_OPTIONS: { value: FinMotif; label: string; desc: string }[] = [
  { value: "preavis_locataire",  label: "Préavis donné par le locataire",  desc: "Le locataire a donné congé (départ volontaire)." },
  { value: "preavis_bailleur",   label: "Préavis donné par le bailleur",   desc: "Vous avez donné congé (vente, reprise, motif légitime)." },
  { value: "fin_terme",          label: "Fin du terme du bail",            desc: "Le bail est arrivé à son terme contractuel." },
  { value: "accord_amiable",     label: "Accord amiable",                  desc: "Les 2 parties ont convenu de mettre fin au bail." },
]

export default function RelouerModal({ open, onClose, onSuccess, annonce }: Props) {
  const [motif, setMotif] = useState<FinMotif>("accord_amiable")
  const [detail, setDetail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // Pré-sélectionne le motif selon preavis_donne_par
      if (annonce.preavis_donne_par === "locataire") setMotif("preavis_locataire")
      else if (annonce.preavis_donne_par === "proprietaire" || annonce.preavis_donne_par === "bailleur") setMotif("preavis_bailleur")
      else setMotif("accord_amiable")
      setDetail("")
      setError(null)
      setSubmitting(false)
    }
  }, [open, annonce.preavis_donne_par])

  // V62 a11y — ESC ferme la modale + scroll lock pendant ouverture (WCAG 2.1.2).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, submitting, onClose])

  async function confirm() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/baux/relouer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annonceId: annonce.id,
          finMotif: motif,
          finMotifDetail: detail.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        setError(json?.error || "Erreur — réessayez plus tard.")
        setSubmitting(false)
        return
      }
      onSuccess()
    } catch {
      setError("Erreur réseau — réessayez plus tard.")
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Terminer le bail et relouer ce bien"
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif" }}
    >
      <div style={{ background: "#fff", borderRadius: 24, maxWidth: 540, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "28px 32px 0" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "#a16207", margin: "0 0 10px" }}>
            Fin de bail · Relocation
          </p>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "0 0 12px", color: "#111", letterSpacing: "-0.4px", lineHeight: 1.15 }}>
            Terminer le bail et relouer
          </h2>
          <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 18px", lineHeight: 1.55 }}>
            Le bail de <strong style={{ color: "#111" }}>{annonce.titre || "ce bien"}</strong>{annonce.ville ? ` à ${annonce.ville}` : ""}
            {" "}sera archivé. L&apos;annonce repassera en statut <strong style={{ color: "#111" }}>« disponible »</strong> avec
            photos et description conservées. Action irréversible.
          </p>
        </div>

        <div style={{ padding: "0 32px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 8px" }}>
            Motif de fin
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {MOTIF_OPTIONS.map(opt => (
              <label key={opt.value} style={{
                display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                padding: "10px 12px",
                borderRadius: 12,
                border: motif === opt.value ? "1.5px solid #111" : "1px solid #EAE6DF",
                background: motif === opt.value ? "#FAF8F3" : "#fff",
                transition: "border 120ms ease, background 120ms ease",
              }}>
                <input type="radio" name="motif" value={opt.value} checked={motif === opt.value} onChange={() => setMotif(opt.value)} style={{ marginTop: 3, accentColor: "#111" }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, letterSpacing: "-0.1px" }}>{opt.label}</p>
                  <p style={{ fontSize: 12, color: "#6b6559", margin: "2px 0 0", lineHeight: 1.45 }}>{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "10px 0 6px" }}>
            Précisions <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: "0.2px", color: "#a8a39c" }}>· optionnel</span>
          </p>
          <textarea
            value={detail}
            onChange={e => setDetail(e.target.value.slice(0, 500))}
            placeholder="Ex : préavis donné le 15/03 pour un déménagement professionnel"
            rows={3}
            style={{
              width: "100%", padding: "10px 12px",
              border: "1px solid #EAE6DF", borderRadius: 12,
              fontSize: 13, fontFamily: "inherit", color: "#111",
              resize: "vertical", boxSizing: "border-box", outline: "none", background: "#fff",
            }}
          />
          <p style={{ fontSize: 10, color: "#a8a39c", margin: "4px 0 0", textAlign: "right" as const }}>
            {detail.length}/500
          </p>

          {error && (
            <div style={{ background: "#FEECEC", border: "1px solid #F4C9C9", color: "#b91c1c", padding: "10px 12px", borderRadius: 12, fontSize: 12, marginTop: 10 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #EAE6DF", padding: "14px 24px", display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{ background: "transparent", border: "none", color: "#8a8477", fontSize: 12, fontWeight: 600, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", padding: "10px 18px", textTransform: "uppercase", letterSpacing: "0.3px" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "11px 22px", fontSize: 12, fontWeight: 700, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px", opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Archivage…" : "Confirmer · Archiver et republier"}
          </button>
        </div>
      </div>
    </div>
  )
}
