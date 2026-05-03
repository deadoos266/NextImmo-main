"use client"
/**
 * V58.2 — Modale "Restituer le dépôt de garantie"
 *
 * Affichée depuis /proprietaire/baux/[id] ou /proprietaire/baux/historique
 * quand le bail est clos (bail_termine_at posé) + dépôt pas encore restitué
 * + caution > 0.
 *
 * UX :
 *   - Header : montant total dépôt (caution)
 *   - Liste éditable de retenues : libellé + montant + type
 *     (degradation / loyer_impaye / charges / autre)
 *   - Type "degradation" recommandé d'avoir un appui EDL sortie
 *     (lien si edlSortieId fourni)
 *   - Calcul auto en bas : "Total à restituer = caution - somme retenues"
 *   - Bouton "Confirmer la restitution" → POST /api/baux/restitution-depot
 *   - Garde-fou : si retenues > caution, bloque submit
 *   - Validation côté serveur (route V57.2) : motifs obligatoires si retenue
 */

import { useEffect, useState } from "react"

interface MotifRetenue {
  libelle: string
  montant: number
  type: "degradation" | "loyer_impaye" | "charges" | "autre"
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (result: { montantRestitue: number; soldePdfUrl: string | null }) => void
  annonce: {
    id: number
    titre: string | null
    ville: string | null
    caution: number | null
    locataire_email: string | null
  }
  /** ID de l'EDL sortie validé (pour pré-remplir les motifs depuis les
   *  observations). Optionnel — si null, le proprio remplit à la main. */
  edlSortieId?: string | null
}

const TYPE_OPTIONS: { value: MotifRetenue["type"]; label: string }[] = [
  { value: "degradation",   label: "Dégradation" },
  { value: "loyer_impaye",  label: "Loyer impayé" },
  { value: "charges",       label: "Charges" },
  { value: "autre",         label: "Autre" },
]

function formatEur(n: number): string {
  return `${(Number(n) || 0).toLocaleString("fr-FR")} €`
}

export default function RestituerDepotModal({ open, onClose, onSuccess, annonce, edlSortieId }: Props) {
  const [motifs, setMotifs] = useState<MotifRetenue[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  if (!open) return null

  const caution = Number(annonce.caution || 0)
  const sumMotifs = motifs.reduce((acc, m) => acc + Math.max(0, Number(m.montant) || 0), 0)
  const montantRestitue = Math.max(0, caution - sumMotifs)
  const overflow = sumMotifs > caution

  function addMotif() {
    setMotifs([...motifs, { libelle: "", montant: 0, type: "degradation" }])
  }

  function updateMotif(idx: number, patch: Partial<MotifRetenue>) {
    setMotifs(motifs.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }

  function removeMotif(idx: number) {
    setMotifs(motifs.filter((_, i) => i !== idx))
  }

  async function confirm() {
    if (submitting || overflow) return
    // Validation : si motifs.length > 0, chaque libellé doit être non vide
    const invalid = motifs.find(m => !m.libelle.trim() || (Number(m.montant) || 0) <= 0)
    if (invalid) {
      setError("Chaque retenue doit avoir un libellé et un montant > 0.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/baux/restitution-depot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annonceId: annonce.id,
          montantRetenu: sumMotifs,
          motifsRetenue: motifs.map(m => ({
            libelle: m.libelle.trim(),
            montant: Math.max(0, Number(m.montant) || 0),
            type: m.type,
          })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        setError(json?.error || "Erreur — réessayez plus tard.")
        setSubmitting(false)
        return
      }
      onSuccess({ montantRestitue: json.montantRestitue, soldePdfUrl: json.soldePdfUrl ?? null })
    } catch {
      setError("Erreur réseau — réessayez plus tard.")
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Restituer le dépôt de garantie"
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif", overflow: "auto" }}
    >
      <div style={{ background: "#fff", borderRadius: 24, maxWidth: 640, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "28px 32px 0", flexShrink: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "#15803d", margin: "0 0 10px" }}>
            Restitution dépôt de garantie
          </p>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "0 0 12px", color: "#111", letterSpacing: "-0.4px", lineHeight: 1.15 }}>
            Restituer {formatEur(caution)}
          </h2>
          <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 12px", lineHeight: 1.55 }}>
            Pour <strong style={{ color: "#111" }}>{annonce.titre || "ce bien"}</strong>{annonce.ville ? ` à ${annonce.ville}` : ""},
            locataire <strong style={{ color: "#111" }}>{annonce.locataire_email || "—"}</strong>.
            Délai légal ALUR : <strong style={{ color: "#111" }}>2 mois maximum</strong> en cas de retenue.
          </p>
          {edlSortieId && (
            <p style={{ fontSize: 12, color: "#6b6559", margin: "0 0 14px", padding: "8px 12px", background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 12 }}>
              💡 Les retenues pour dégradations doivent être justifiées par l&apos;EDL de sortie (loi du 6 juillet 1989, art. 22). <a href={`/edl/consulter/${edlSortieId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#a16207", fontWeight: 600 }}>Consulter l&apos;EDL →</a>
            </p>
          )}
        </div>

        <div style={{ padding: "12px 32px", flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
              Retenues sur dépôt
            </p>
            <button
              type="button"
              onClick={addMotif}
              style={{ background: "transparent", border: "1px dashed #EAE6DF", color: "#111", borderRadius: 999, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              + Ajouter
            </button>
          </div>

          {motifs.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8a8477", fontStyle: "italic" as const, margin: "0 0 14px", padding: "14px 16px", background: "#F7F4EF", borderRadius: 12 }}>
              Aucune retenue — restitution intégrale prévue.
              <br />
              <span style={{ fontSize: 12, color: "#a8a39c" }}>Cliquez « + Ajouter » pour ajouter une retenue motivée.</span>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              {motifs.map((m, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 130px 32px", gap: 8, alignItems: "center", padding: 10, border: "1px solid #EAE6DF", borderRadius: 12, background: "#fff" }}>
                  <input
                    type="text"
                    value={m.libelle}
                    onChange={e => updateMotif(i, { libelle: e.target.value.slice(0, 100) })}
                    placeholder="Ex : tâche moquette chambre"
                    aria-label={`Retenue ${i + 1} — libellé`}
                    style={{ padding: "8px 10px", border: "1px solid #EAE6DF", borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: "#111", outline: "none" }}
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={m.montant || ""}
                    onChange={e => updateMotif(i, { montant: Number(e.target.value) })}
                    placeholder="€"
                    aria-label={`Retenue ${i + 1} — montant en euros`}
                    style={{ padding: "8px 10px", border: "1px solid #EAE6DF", borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: "#111", outline: "none", textAlign: "right" as const }}
                  />
                  <select
                    value={m.type}
                    onChange={e => updateMotif(i, { type: e.target.value as MotifRetenue["type"] })}
                    aria-label={`Retenue ${i + 1} — type`}
                    style={{ padding: "8px 10px", border: "1px solid #EAE6DF", borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: "#111", outline: "none", background: "#fff" }}
                  >
                    {TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeMotif(i)}
                    aria-label="Supprimer cette retenue"
                    style={{ background: "transparent", border: "none", color: "#b91c1c", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Calcul */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "14px 16px", background: "#FAF8F3", borderRadius: 12, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b6559" }}>
              <span>Dépôt initial</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatEur(caution)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: motifs.length > 0 ? "#a16207" : "#8a8477" }}>
              <span>− Retenues ({motifs.length})</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatEur(sumMotifs)}</span>
            </div>
            <div style={{ height: 1, background: "#EAE6DF", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: overflow ? "#b91c1c" : "#15803d" }}>
              <span>= Restitué au locataire</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatEur(montantRestitue)}</span>
            </div>
          </div>

          {overflow && (
            <div style={{ background: "#FEECEC", border: "1px solid #F4C9C9", color: "#b91c1c", padding: "10px 12px", borderRadius: 12, fontSize: 12, marginTop: 10 }}>
              Les retenues ({formatEur(sumMotifs)}) dépassent le dépôt ({formatEur(caution)}). Ajustez les montants.
            </div>
          )}
          {error && !overflow && (
            <div style={{ background: "#FEECEC", border: "1px solid #F4C9C9", color: "#b91c1c", padding: "10px 12px", borderRadius: 12, fontSize: 12, marginTop: 10 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #EAE6DF", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: "#a8a39c", margin: 0, lineHeight: 1.4, maxWidth: 280 }}>
            Une quittance de solde de tout compte (PDF) sera générée automatiquement et envoyée au locataire.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
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
              disabled={submitting || overflow}
              style={{ background: overflow ? "#EAE6DF" : "#111", color: overflow ? "#8a8477" : "#fff", border: "none", borderRadius: 999, padding: "11px 22px", fontSize: 12, fontWeight: 700, cursor: submitting ? "wait" : overflow ? "not-allowed" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px", opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? "Enregistrement…" : "Confirmer la restitution"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
