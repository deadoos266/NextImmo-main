"use client"
import { useState } from "react"
import Modal from "./ui/Modal"
import SignatureCanvas from "./ui/SignatureCanvas"

interface Props {
  open: boolean
  onClose: () => void
  onSigned: () => void
  edlId: string
  role: "locataire" | "bailleur"
  typeEdl: "entree" | "sortie"
  dateEdl: string
  bienTitre: string
  nomDefaut?: string
}

/**
 * Modale de signature électronique pour un EDL.
 * Flow identique à BailSignatureModal mais simplifié (pas de garant,
 * récap plus court). Appelle POST /api/edl/signer.
 */
export default function EdlSignatureModal({
  open,
  onClose,
  onSigned,
  edlId,
  role,
  typeEdl,
  dateEdl,
  bienTitre,
  nomDefaut = "",
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [accepte, setAccepte] = useState(false)
  const [nom, setNom] = useState(nomDefaut)
  const [mention, setMention] = useState("")
  const [signaturePng, setSignaturePng] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typeLabel = typeEdl === "entree" ? "d'entrée" : "de sortie"
  const dateLabel = dateEdl
    ? new Date(dateEdl).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
      })
    : ""
  const roleLabel = role === "locataire" ? "Locataire" : "Bailleur"

  function reset() {
    setStep(1)
    setAccepte(false)
    setMention("")
    setSignaturePng(null)
    setError(null)
    setSubmitting(false)
  }
  function close() {
    reset()
    onClose()
  }

  async function submit() {
    if (!signaturePng) return setError("Veuillez signer avant de valider.")
    if (nom.trim().length < 2) return setError("Nom requis.")
    if (!/lu et approuv/i.test(mention)) return setError('La mention doit contenir "Lu et approuvé".')

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/edl/signer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edlId, role, nom: nom.trim(), mention: mention.trim(), signaturePng }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error || "Erreur serveur — réessayez")
        setSubmitting(false)
        return
      }
      onSigned()
      close()
    } catch {
      setError("Connexion interrompue — réessayez")
      setSubmitting(false)
    }
  }

  const footerCancel = (
    <button
      onClick={close}
      disabled={submitting}
      style={{
        background: "white", border: "1px solid #EAE6DF", color: "#111",
        borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 14,
        cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
      }}
    >Annuler</button>
  )

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Signer l'état des lieux ${typeLabel} — ${roleLabel}`}
      maxWidth={680}
      strict={submitting}
      footer={
        step === 1 ? (
          <>
            {footerCancel}
            <button onClick={() => setStep(2)}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Poursuivre →
            </button>
          </>
        ) : step === 2 ? (
          <>
            {footerCancel}
            <button onClick={() => setStep(3)} disabled={!accepte}
              style={{ background: accepte ? "#111" : "#EAE6DF", color: accepte ? "white" : "#8a8477", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: accepte ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Je suis prêt à signer →
            </button>
          </>
        ) : (
          <>
            {footerCancel}
            <button onClick={submit} disabled={!signaturePng || submitting}
              style={{ background: signaturePng && !submitting ? "#15803d" : "#EAE6DF", color: signaturePng && !submitting ? "white" : "#8a8477", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: signaturePng && !submitting ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              {submitting ? "Signature en cours…" : "✓ Signer l'EDL"}
            </button>
          </>
        )
      }
    >
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? "#111" : "#EAE6DF", transition: "background 0.2s" }} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>1. Récapitulatif</h3>
          <p style={{ color: "#8a8477", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Consultez l&apos;état des lieux en détail avant de signer. Vous pouvez fermer cette modale et revenir plus tard.
          </p>
          <div style={{ background: "#F7F4EF", borderRadius: 14, padding: "16px 20px", fontSize: 14, display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 10, columnGap: 20, alignItems: "center" }}>
            <span style={{ color: "#8a8477", fontSize: 12 }}>Bien</span>
            <span style={{ fontWeight: 700 }}>{bienTitre}</span>
            <span style={{ color: "#8a8477", fontSize: 12 }}>Type</span>
            <span>État des lieux {typeLabel}</span>
            <span style={{ color: "#8a8477", fontSize: 12 }}>Date EDL</span>
            <span>{dateLabel}</span>
            <span style={{ color: "#8a8477", fontSize: 12 }}>Votre rôle</span>
            <span style={{ fontWeight: 700 }}>{roleLabel}</span>
          </div>
          <div style={{ marginTop: 18, padding: "12px 16px", background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 12, fontSize: 12, color: "#1d4ed8", lineHeight: 1.6 }}>
            💡 La signature électronique est juridiquement valable (art. 1366 Code civil + règlement eIDAS UE 910/2014). Identité + timestamp + IP sont horodatés.
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>2. Acceptation</h3>
          <p style={{ color: "#8a8477", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Confirmez que vous avez examiné l&apos;état des lieux et acceptez son contenu.
          </p>
          <label style={{ display: "flex", gap: 12, padding: "16px 18px", borderRadius: 14, background: accepte ? "#F0FAEE" : "#F7F4EF", border: `1px solid ${accepte ? "#86efac" : "#EAE6DF"}`, cursor: "pointer", alignItems: "flex-start" }}>
            <input type="checkbox" checked={accepte} onChange={e => setAccepte(e.target.checked)}
              style={{ marginTop: 3, cursor: "pointer", accentColor: "#15803d" }} />
            <div style={{ flex: 1, fontSize: 14, lineHeight: 1.6, color: "#111" }}>
              <strong>Je reconnais avoir examiné l&apos;état des lieux</strong> {typeLabel} dans son intégralité (pièces, équipements, compteurs, photos) et j&apos;en accepte les observations en tant que <strong>{roleLabel.toLowerCase()}</strong>.
            </div>
          </label>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>3. Signer</h3>
          <p style={{ color: "#8a8477", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Confirmez votre identité, recopiez la mention, signez dans le cadre.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", display: "block", marginBottom: 6 }}>
                Votre nom complet *
              </label>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Prénom Nom"
                style={{ width: "100%", padding: "11px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: "#111", background: "white" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", display: "block", marginBottom: 6 }}>
                Mention manuscrite *
              </label>
              <input value={mention} onChange={e => setMention(e.target.value)} placeholder="Lu et approuvé, bon pour accord"
                style={{ width: "100%", padding: "11px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: "#111", background: "white", fontStyle: "italic" }} />
              <p style={{ fontSize: 11, color: "#8a8477", marginTop: 4, lineHeight: 1.5 }}>
                Recopiez : <em>Lu et approuvé, bon pour accord</em>
              </p>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", display: "block", marginBottom: 8 }}>
                Signature *
              </label>
              <SignatureCanvas onChange={setSignaturePng} />
            </div>
            {error && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #F4C9C9", borderRadius: 10, fontSize: 13, color: "#b91c1c" }}>
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
