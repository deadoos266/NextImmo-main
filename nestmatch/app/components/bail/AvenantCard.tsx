"use client"
// V36.3 — Card avenant : affiche un avenant proposé/signé avec diff visuel
// + actions selon role + statut.
// Audit V35 R35.1 (🔴) : avant ce composant, les avenants V34.7 étaient
// shippés en backend uniquement. Le user recevait un message [AVENANT_PROPOSE]
// brut sans pouvoir réviser/signer via l'UI.

import { useState } from "react"
import SignatureCanvas from "../ui/SignatureCanvas"

export interface Avenant {
  id: string
  numero: number
  type: string
  titre: string
  description?: string | null
  ancien_payload?: Record<string, unknown> | null
  nouveau_payload?: Record<string, unknown> | null
  statut: "propose" | "signe_locataire" | "signe_proprio" | "actif" | "annule"
  propose_par_email: string
  signe_locataire_at?: string | null
  signe_bailleur_at?: string | null
  created_at: string
}

interface Props {
  avenant: Avenant
  myRole: "locataire" | "proprietaire"
  myEmail: string
  onRefreshed?: () => void
}

const TYPE_LABELS: Record<string, string> = {
  ajout_colocataire: "Ajout d'un colocataire",
  retrait_colocataire: "Retrait d'un colocataire",
  modif_loyer: "Modification du loyer",
  modif_charges: "Modification des charges",
  ajout_garant: "Ajout d'un garant",
  retrait_garant: "Retrait d'un garant",
  modif_clause: "Modification d'une clause",
  autre: "Autre modification",
}

const FIELD_LABELS: Record<string, string> = {
  prix: "Loyer HC",
  charges: "Charges",
  caution: "Dépôt de garantie",
  locataire_email: "Email locataire",
  meuble: "Meublé",
  surface: "Surface (m²)",
  pieces: "Pièces",
  etage: "Étage",
  ascenseur: "Ascenseur",
  balcon: "Balcon",
  terrasse: "Terrasse",
  jardin: "Jardin",
  cave: "Cave",
  fibre: "Fibre",
  parking: "Parking",
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "boolean") return v ? "Oui" : "Non"
  if (typeof v === "number") {
    // Heuristique : prix/charges → afficher en €
    return v.toLocaleString("fr-FR")
  }
  return String(v)
}

function buildDiff(ancien: Record<string, unknown> | null | undefined, nouveau: Record<string, unknown> | null | undefined): { key: string; label: string; ancien: string; nouveau: string }[] {
  if (!nouveau) return []
  const keys = new Set<string>([...Object.keys(ancien || {}), ...Object.keys(nouveau)])
  const out: { key: string; label: string; ancien: string; nouveau: string }[] = []
  for (const k of keys) {
    const a = (ancien || {})[k]
    const n = nouveau[k]
    if (formatVal(a) !== formatVal(n)) {
      out.push({
        key: k,
        label: FIELD_LABELS[k] || k,
        ancien: formatVal(a),
        nouveau: formatVal(n),
      })
    }
  }
  return out
}

function normaliserMention(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[  ]/g, " ").replace(/\s+/g, " ").trim()
}

export default function AvenantCard({ avenant, myRole, myEmail, onRefreshed }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"review" | "sign" | "refuse">("review")
  const [nom, setNom] = useState("")
  const [mention, setMention] = useState("")
  const [signaturePng, setSignaturePng] = useState<string | null>(null)
  const [refusRaison, setRefusRaison] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dejaSigne = myRole === "locataire" ? !!avenant.signe_locataire_at : !!avenant.signe_bailleur_at
  const autreSigne = myRole === "locataire" ? !!avenant.signe_bailleur_at : !!avenant.signe_locataire_at
  const proposeParMoi = (avenant.propose_par_email || "").toLowerCase() === myEmail.toLowerCase()
  const isActif = avenant.statut === "actif"
  const isAnnule = avenant.statut === "annule"

  const diff = buildDiff(avenant.ancien_payload || null, avenant.nouveau_payload || null)

  const meta =
    isActif ? { bg: "#F0FAEE", border: "#C6E9C0", color: "#15803d", label: "Avenant actif" }
    : isAnnule ? { bg: "#F7F4EF", border: "#EAE6DF", color: "#8a8477", label: "Avenant annulé" }
    : dejaSigne ? { bg: "#F0FAEE", border: "#C6E9C0", color: "#15803d", label: `Vous avez signé · en attente ${myRole === "locataire" ? "du bailleur" : "du locataire"}` }
    : autreSigne ? { bg: "#FBF6EA", border: "#EADFC6", color: "#a16207", label: `${myRole === "locataire" ? "Le bailleur" : "Le locataire"} a signé · à votre tour` }
    : proposeParMoi ? { bg: "#EEF3FB", border: "#D7E3F4", color: "#1d4ed8", label: "Proposition envoyée · en attente" }
    : { bg: "#FBF6EA", border: "#EADFC6", color: "#9a3412", label: "Proposition reçue · à examiner" }

  async function submitSign() {
    if (submitting) return
    if (!nom.trim() || nom.trim().length < 2) { setError("Nom requis"); return }
    // V50.11 — STRICT equality (avant : .includes() laissait passer doublons).
    if (normaliserMention(mention) !== "lu et approuve, bon pour accord") {
      setError('La mention doit être recopiée exactement : "Lu et approuvé, bon pour accord" — c\'est une exigence légale.')
      return
    }
    if (!signaturePng) { setError("Signez avant de valider"); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/bail/avenant/${avenant.id}/signer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mention: mention.trim(), signaturePng }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (!res.ok || !json.ok) { setError(json.error || "Erreur"); return }
      setOpen(false)
      onRefreshed?.()
    } finally {
      setSubmitting(false)
    }
  }

  async function submitRefuse() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/bail/avenant/${avenant.id}/refuser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raison: refusRaison.trim() }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (!res.ok || !json.ok) { setError(json.error || "Erreur"); return }
      setOpen(false)
      onRefreshed?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div style={{
        background: "#fff",
        border: `1px solid ${meta.border}`,
        borderRadius: 18,
        padding: "16px 20px",
        marginBottom: 12,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 4px" }}>
              Avenant N°{avenant.numero} · {TYPE_LABELS[avenant.type] || avenant.type}
            </p>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#111", margin: 0, lineHeight: 1.3 }}>{avenant.titre}</h3>
          </div>
          <span style={{
            background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
            padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "1.1px", whiteSpace: "nowrap",
          }}>
            {meta.label}
          </span>
        </div>

        {avenant.description && (
          <p style={{ fontSize: 12.5, color: "#6b6559", margin: "0 0 10px", lineHeight: 1.55, fontStyle: "italic" }}>
            « {avenant.description} »
          </p>
        )}

        {diff.length > 0 && (
          <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 6px" }}>
              Modifications proposées
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {diff.map(d => (
                <li key={d.key} style={{ fontSize: 12.5, color: "#111", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <strong style={{ fontWeight: 600 }}>{d.label}</strong>
                  <span style={{ color: "#8a8477", textDecoration: "line-through" }}>{d.ancien}</span>
                  <span style={{ color: "#8a8477" }}>→</span>
                  <span style={{ color: "#15803d", fontWeight: 600 }}>{d.nouveau}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isActif && !isAnnule && !dejaSigne && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <button
              type="button"
              onClick={() => { setStep("sign"); setOpen(true) }}
              style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
            >
              ✓ Accepter et signer
            </button>
            <button
              type="button"
              onClick={() => { setStep("refuse"); setOpen(true) }}
              style={{ background: "#fff", color: "#b91c1c", border: "1px solid #F4C9C9", borderRadius: 999, padding: "9px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Refuser
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif" }}
          onClick={e => { if (e.target === e.currentTarget && !submitting) setOpen(false) }}
        >
          <div style={{ background: "#fff", borderRadius: 24, maxWidth: 540, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", padding: 28, maxHeight: "90vh", overflowY: "auto" }}>
            {step === "sign" && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>
                  Signer l&apos;avenant N°{avenant.numero}
                </p>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, margin: "0 0 12px", color: "#111", letterSpacing: "-0.4px" }}>
                  {avenant.titre}
                </h2>
                <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 18px", lineHeight: 1.6 }}>
                  En signant, vous acceptez les modifications listées ci-dessus. La signature est juridiquement valable (eIDAS Niveau 1, art. 1366 Code civil).
                </p>

                <label style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.3px", display: "block", marginBottom: 6 }}>
                  Votre nom complet
                </label>
                <input
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="Prénom Nom"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, marginBottom: 14, fontFamily: "inherit", outline: "none" }}
                />

                <label style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.3px", display: "block", marginBottom: 6 }}>
                  Mention manuscrite
                </label>
                <input
                  value={mention}
                  onChange={e => setMention(e.target.value)}
                  placeholder="Lu et approuvé, bon pour accord"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, marginBottom: 4, fontFamily: "inherit", fontStyle: "italic", outline: "none" }}
                />
                <p style={{ fontSize: 11, color: "#8a8477", margin: "0 0 14px" }}>
                  Recopiez exactement : <em>Lu et approuvé, bon pour accord</em>
                </p>

                <label style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.3px", display: "block", marginBottom: 6 }}>
                  Signature
                </label>
                <SignatureCanvas onChange={setSignaturePng} />

                {error && <div style={{ marginTop: 10, padding: "10px 14px", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 10, fontSize: 13, color: "#b91c1c" }}>{error}</div>}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setOpen(false)} disabled={submitting} style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Annuler
                  </button>
                  <button type="button" onClick={submitSign} disabled={submitting} style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: submitting ? 0.5 : 1 }}>
                    {submitting ? "Signature…" : "✓ Signer l'avenant"}
                  </button>
                </div>
              </>
            )}

            {step === "refuse" && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>
                  Refuser l&apos;avenant N°{avenant.numero}
                </p>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, margin: "0 0 12px", color: "#111", letterSpacing: "-0.4px" }}>
                  Refuser cette proposition ?
                </h2>
                <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 16px", lineHeight: 1.6 }}>
                  L&apos;auteur sera informé. Vous pouvez préciser la raison ou poursuivre la conversation depuis la messagerie.
                </p>
                <textarea
                  value={refusRaison}
                  onChange={e => setRefusRaison(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Ex : le loyer proposé dépasse mon budget."
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none" }}
                />
                <p style={{ fontSize: 10, color: "#8a8477", margin: "4px 0 14px", textAlign: "right" }}>{refusRaison.length}/500</p>

                {error && <div style={{ marginBottom: 10, padding: "10px 14px", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 10, fontSize: 13, color: "#b91c1c" }}>{error}</div>}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setOpen(false)} disabled={submitting} style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Annuler
                  </button>
                  <button type="button" onClick={submitRefuse} disabled={submitting} style={{ background: "#b91c1c", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: submitting ? 0.5 : 1 }}>
                    {submitting ? "Envoi…" : "Confirmer le refus"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
