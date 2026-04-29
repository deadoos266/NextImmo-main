"use client"
// V34.5 — Modale "Donner congé" partagée locataire/proprio.
// Audit V31 R3.4 : préavis (notice) workflow.

import { useState, useMemo } from "react"
import { LOCATAIRE_MOTIFS, PROPRIETAIRE_MOTIFS, calculerPreavis, type LocataireMotif, type ProprietaireMotif } from "../../../lib/preavis"

interface Props {
  open: boolean
  onClose: () => void
  onSubmitted: () => void
  role: "locataire" | "proprietaire"
  annonceId: number
  meuble: boolean
  zoneTendue: boolean
}

export default function PreavisModal({ open, onClose, onSubmitted, role, annonceId, meuble, zoneTendue }: Props) {
  const motifs = role === "locataire" ? LOCATAIRE_MOTIFS : PROPRIETAIRE_MOTIFS
  const [motif, setMotif] = useState<string>(motifs[0]?.code || "autre")
  const [detail, setDetail] = useState("")
  const [dateDepart, setDateDepart] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useMemo(() => {
    const dateEnvoi = new Date()
    return calculerPreavis({
      qui: role,
      meuble,
      zoneTendue,
      motifLocataire: role === "locataire" ? (motif as LocataireMotif) : undefined,
      dateEnvoi,
      dateDepartSouhaitee: dateDepart ? new Date(dateDepart) : null,
    })
  }, [role, meuble, zoneTendue, motif, dateDepart])

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/bail/preavis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annonceId,
          motif,
          detail: detail.trim() || undefined,
          dateDepartSouhaitee: dateDepart || undefined,
        }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; dateFin?: string }
      if (!res.ok || !json.ok) {
        setError(json.error || "Erreur — réessayez")
        return
      }
      onSubmitted()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Donner congé"
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif" }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div style={{ background: "#fff", borderRadius: 24, maxWidth: 520, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", padding: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>
          Préavis — bail résidentiel
        </p>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "0 0 12px", color: "#111", letterSpacing: "-0.4px" }}>
          {role === "locataire" ? "Donner congé à mon bailleur" : "Donner congé à mon locataire"}
        </h2>
        <p style={{ fontSize: 13.5, color: "#4b5563", margin: "0 0 18px", lineHeight: 1.6 }}>
          {role === "locataire"
            ? "Une lettre de congé sera envoyée à votre bailleur avec date d'effet calculée selon la loi."
            : "Une lettre de congé sera envoyée à votre locataire. Délai légal : 6 mois minimum, motif sérieux requis."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.3px", margin: 0 }}>Motif</p>
          {motifs.map(m => (
            <label key={m.code} style={{
              display: "flex", gap: 10, padding: "10px 14px",
              border: `1.5px solid ${motif === m.code ? "#111" : "#EAE6DF"}`,
              borderRadius: 12, cursor: "pointer", alignItems: "center", fontSize: 13, color: "#111",
              background: motif === m.code ? "#F7F4EF" : "#fff",
            }}>
              <input
                type="radio"
                name="preavis-motif"
                value={m.code}
                checked={motif === m.code}
                onChange={() => setMotif(m.code)}
                style={{ accentColor: "#111" }}
              />
              {m.label}
              {"reduit" in m && (m as { reduit: boolean }).reduit && (
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#15803d", background: "#F0FAEE", border: "1px solid #C6E9C0", padding: "2px 8px", borderRadius: 999 }}>
                  Préavis réduit
                </span>
              )}
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.3px", display: "block", marginBottom: 6 }}>
            Précisions (optionnel)
          </label>
          <textarea
            value={detail}
            onChange={e => setDetail(e.target.value.slice(0, 500))}
            placeholder="Ex : nouvelle mutation à Lyon à compter du..."
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13, fontFamily: "inherit", color: "#111", resize: "vertical", outline: "none" }}
          />
          <p style={{ fontSize: 10, color: "#8a8477", margin: "4px 0 0", textAlign: "right" }}>{detail.length}/500</p>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.3px", display: "block", marginBottom: 6 }}>
            Date de départ souhaitée (optionnel — sinon = date légale)
          </label>
          <input
            type="date"
            value={dateDepart}
            onChange={e => setDateDepart(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: "#111", outline: "none" }}
          />
        </div>

        {/* Récap calcul live */}
        <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 18px", marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 6px" }}>
            Calcul du préavis
          </p>
          <p style={{ fontSize: 13, color: "#a16207", margin: "0 0 4px", lineHeight: 1.55 }}>
            Délai légal : <strong>{preview.delaiMois} mois</strong>
          </p>
          <p style={{ fontSize: 13, color: "#a16207", margin: "0 0 4px", lineHeight: 1.55 }}>
            Fin de bail effective : <strong>{preview.dateFinEffective.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>
          </p>
          {preview.bonus && (
            <p style={{ fontSize: 11.5, color: "#a16207", margin: "6px 0 0", fontStyle: "italic", opacity: 0.85 }}>
              {preview.bonus}
            </p>
          )}
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 10, fontSize: 13, color: "#b91c1c", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{ background: "#9a3412", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", opacity: submitting ? 0.5 : 1 }}
          >
            {submitting ? "Envoi…" : "Confirmer le congé"}
          </button>
        </div>
      </div>
    </div>
  )
}
