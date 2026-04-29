"use client"
// V38.3 — Modale "Proposer un avenant" côté proprio (audit V37 R37.1).
// Audit V35 R35.1 → backend POST /api/bail/avenant existait depuis V34.7
// + UI render des avenants existants (V36.3 AvenantCard) — mais aucune UI
// pour CRÉER un nouvel avenant. Cette modale ferme le gap.
//
// Form dynamique selon le type sélectionné :
// - modif_loyer : input ancien/nouveau loyer HC
// - modif_charges : input nouvelles charges
// - ajout_colocataire : nom + email du colocataire
// - retrait_colocataire : email à retirer
// - ajout_garant : nom + email + lien
// - retrait_garant : confirmation simple
// - modif_clause : champ texte libre
// - autre : titre + description libre
//
// Génère le `nouveau_payload` jsonb et POST /api/bail/avenant.

import { useState } from "react"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  annonceId: number
  /** Loyer actuel (pour pré-remplir modif_loyer). */
  loyerHC?: number
  /** Charges actuelles (pour pré-remplir modif_charges). */
  charges?: number
}

type AvenantType =
  | "ajout_colocataire"
  | "retrait_colocataire"
  | "modif_loyer"
  | "modif_charges"
  | "ajout_garant"
  | "retrait_garant"
  | "modif_clause"
  | "autre"

const TYPES: { code: AvenantType; label: string; desc: string }[] = [
  { code: "modif_loyer", label: "Modifier le loyer", desc: "Ajustement du loyer HC (hors indexation IRL)" },
  { code: "modif_charges", label: "Modifier les charges", desc: "Changement des charges mensuelles" },
  { code: "ajout_colocataire", label: "Ajouter un colocataire", desc: "Nouveau locataire signataire du bail" },
  { code: "retrait_colocataire", label: "Retirer un colocataire", desc: "Locataire qui quitte le bail (avec accord)" },
  { code: "ajout_garant", label: "Ajouter un garant", desc: "Caution solidaire ajoutée" },
  { code: "retrait_garant", label: "Retirer un garant", desc: "Caution solidaire retirée" },
  { code: "modif_clause", label: "Modifier une clause", desc: "Règles de vie, équipements, autres conditions" },
  { code: "autre", label: "Autre modification", desc: "Cas non listé — décrire librement" },
]

export default function ProposerAvenantModal({ open, onClose, onCreated, annonceId, loyerHC, charges }: Props) {
  const [type, setType] = useState<AvenantType>("modif_loyer")
  const [titre, setTitre] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Champs dynamiques par type
  const [nouveauLoyer, setNouveauLoyer] = useState<string>(loyerHC ? String(loyerHC) : "")
  const [nouvellesCharges, setNouvellesCharges] = useState<string>(charges != null ? String(charges) : "")
  const [coloEmail, setColoEmail] = useState("")
  const [coloNom, setColoNom] = useState("")
  const [garantNom, setGarantNom] = useState("")
  const [garantEmail, setGarantEmail] = useState("")
  const [clauseTexte, setClauseTexte] = useState("")

  function buildPayload(): { titre: string; description: string; nouveauPayload: Record<string, unknown> } {
    let titreCalc = titre.trim()
    let descCalc = description.trim()
    const nouveau: Record<string, unknown> = {}

    if (type === "modif_loyer") {
      const n = Number(nouveauLoyer)
      if (Number.isFinite(n) && n > 0) nouveau.prix = n
      if (!titreCalc) titreCalc = `Modification du loyer HC : ${loyerHC || "?"} → ${n} €`
    } else if (type === "modif_charges") {
      const n = Number(nouvellesCharges)
      if (Number.isFinite(n) && n >= 0) nouveau.charges = n
      if (!titreCalc) titreCalc = `Modification des charges : ${charges ?? "?"} → ${n} €`
    } else if (type === "ajout_colocataire") {
      if (coloEmail) nouveau.locataire_email_secondaire = coloEmail.trim().toLowerCase()
      if (coloNom) nouveau.locataire_nom_secondaire = coloNom.trim()
      if (!titreCalc) titreCalc = `Ajout d'un colocataire${coloNom ? " : " + coloNom : ""}`
    } else if (type === "retrait_colocataire") {
      if (coloEmail) nouveau.locataire_email_secondaire = null
      if (!titreCalc) titreCalc = `Retrait du colocataire${coloEmail ? " " + coloEmail : ""}`
    } else if (type === "ajout_garant") {
      if (garantNom) nouveau.garant_nom = garantNom.trim()
      if (garantEmail) nouveau.garant_email = garantEmail.trim().toLowerCase()
      if (!titreCalc) titreCalc = `Ajout d'un garant${garantNom ? " : " + garantNom : ""}`
    } else if (type === "retrait_garant") {
      nouveau.garant_nom = null
      nouveau.garant_email = null
      if (!titreCalc) titreCalc = "Retrait du garant"
    } else if (type === "modif_clause") {
      descCalc = clauseTexte.trim() || descCalc
      if (!titreCalc) titreCalc = "Modification d'une clause particulière"
    } else {
      // autre — pas de payload structuré, le titre + description portent l'info.
      if (!titreCalc) titreCalc = "Modification du bail"
    }
    return { titre: titreCalc, description: descCalc, nouveauPayload: nouveau }
  }

  async function submit() {
    if (submitting) return
    setError(null)
    const { titre: t, description: d, nouveauPayload } = buildPayload()
    if (t.length < 5) { setError("Titre trop court (min 5 caractères)"); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/bail/avenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annonceId,
          type,
          titre: t,
          description: d || undefined,
          nouveauxChamps: nouveauPayload,
        }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (!res.ok || !json.ok) { setError(json.error || "Erreur"); return }
      onCreated()
      // Reset form
      setType("modif_loyer")
      setTitre("")
      setDescription("")
      setNouveauLoyer(loyerHC ? String(loyerHC) : "")
      setNouvellesCharges(charges != null ? String(charges) : "")
      setColoEmail(""); setColoNom("")
      setGarantNom(""); setGarantEmail("")
      setClauseTexte("")
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "10px 14px", border: "1px solid #EAE6DF",
    borderRadius: 10, fontSize: 14, fontFamily: "inherit",
    outline: "none", color: "#111", background: "#fff",
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#8a8477",
    textTransform: "uppercase", letterSpacing: "0.3px",
    display: "block", marginBottom: 6,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Proposer un avenant"
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif" }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div style={{ background: "#fff", borderRadius: 24, maxWidth: 600, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", padding: 28, maxHeight: "90vh", overflowY: "auto" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>
          Avenant au bail
        </p>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "0 0 12px", color: "#111", letterSpacing: "-0.4px" }}>
          Proposer une modification
        </h2>
        <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 20px", lineHeight: 1.6 }}>
          L&apos;avenant sera envoyé au locataire. Une fois signé par les 2 parties, les modifications s&apos;appliquent automatiquement au bail.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Type de modification</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TYPES.map(t => (
              <label key={t.code} style={{
                display: "flex", gap: 10, padding: "10px 14px",
                border: `1.5px solid ${type === t.code ? "#111" : "#EAE6DF"}`,
                borderRadius: 12, cursor: "pointer", alignItems: "flex-start",
                background: type === t.code ? "#F7F4EF" : "#fff",
              }}>
                <input
                  type="radio"
                  name="avenant-type"
                  value={t.code}
                  checked={type === t.code}
                  onChange={() => setType(t.code)}
                  style={{ accentColor: "#111", marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, color: "#111" }}>{t.label}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b6559", lineHeight: 1.5 }}>{t.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Champs dynamiques selon type */}
        {type === "modif_loyer" && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              Nouveau loyer HC (€) {loyerHC ? <span style={{ fontSize: 10, fontWeight: 500, color: "#8a8477" }}>· actuel : {loyerHC} €</span> : null}
            </label>
            <input style={inputStyle} type="number" min={1} value={nouveauLoyer} onChange={e => setNouveauLoyer(e.target.value)} placeholder="1500" />
          </div>
        )}

        {type === "modif_charges" && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              Nouvelles charges (€) {charges != null ? <span style={{ fontSize: 10, fontWeight: 500, color: "#8a8477" }}>· actuelles : {charges} €</span> : null}
            </label>
            <input style={inputStyle} type="number" min={0} value={nouvellesCharges} onChange={e => setNouvellesCharges(e.target.value)} placeholder="80" />
          </div>
        )}

        {type === "ajout_colocataire" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nom du colocataire</label>
              <input style={inputStyle} value={coloNom} onChange={e => setColoNom(e.target.value)} placeholder="Marie Dupont" />
            </div>
            <div>
              <label style={labelStyle}>Email du colocataire</label>
              <input style={inputStyle} type="email" value={coloEmail} onChange={e => setColoEmail(e.target.value)} placeholder="marie@example.com" />
            </div>
          </div>
        )}

        {type === "retrait_colocataire" && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email du colocataire à retirer</label>
            <input style={inputStyle} type="email" value={coloEmail} onChange={e => setColoEmail(e.target.value)} placeholder="marie@example.com" />
          </div>
        )}

        {type === "ajout_garant" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nom du garant</label>
              <input style={inputStyle} value={garantNom} onChange={e => setGarantNom(e.target.value)} placeholder="Jean Dupont (parent)" />
            </div>
            <div>
              <label style={labelStyle}>Email du garant</label>
              <input style={inputStyle} type="email" value={garantEmail} onChange={e => setGarantEmail(e.target.value)} placeholder="jean@example.com" />
            </div>
          </div>
        )}

        {type === "modif_clause" && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Clause modifiée (texte libre)</label>
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={4} value={clauseTexte} onChange={e => setClauseTexte(e.target.value.slice(0, 1000))} placeholder="Ex : autorisation animaux domestiques (chat) à compter du..." />
            <p style={{ fontSize: 10, color: "#8a8477", margin: "4px 0 0", textAlign: "right" }}>{clauseTexte.length}/1000</p>
          </div>
        )}

        {/* Titre custom (optionnel — auto-généré si vide) */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Titre de l&apos;avenant <span style={{ fontSize: 10, fontWeight: 500, color: "#8a8477" }}>· optionnel, auto-généré si vide</span></label>
          <input style={inputStyle} value={titre} onChange={e => setTitre(e.target.value.slice(0, 200))} placeholder="Ex : Avenant N°1 — modification du loyer pour passage en zone tendue" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Description (optionnel)</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={description} onChange={e => setDescription(e.target.value.slice(0, 2000))} placeholder="Contexte, motif, date d'effet, etc." />
          <p style={{ fontSize: 10, color: "#8a8477", margin: "4px 0 0", textAlign: "right" }}>{description.length}/2000</p>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 10, fontSize: 13, color: "#b91c1c", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} disabled={submitting} style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button type="button" onClick={submit} disabled={submitting} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: submitting ? 0.5 : 1 }}>
            {submitting ? "Envoi…" : "Proposer l'avenant"}
          </button>
        </div>
      </div>
    </div>
  )
}
