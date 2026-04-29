"use client"
import { useState, useMemo, useEffect, useRef } from "react"
import Modal from "./ui/Modal"
import SignatureCanvas from "./ui/SignatureCanvas"
import type { BailData } from "../../lib/bailPDF"
import { genererBailPDFBlob } from "../../lib/bailPDF"

// V32.2 — Durée minimum de lecture du PDF avant pouvoir cocher "j'ai lu".
// Empêche les clics réflexes "yolo" qui sapent l'audit-trail eIDAS.
const MIN_LECTURE_SECONDS = 15

interface Props {
  open: boolean
  onClose: () => void
  onSigned: () => void
  bailData: BailData
  annonceId: number
  role: "locataire" | "bailleur" | "garant"
  /** Nom pré-rempli (ex: récupéré du profil) */
  nomDefaut?: string
}

/**
 * Modale de signature électronique pour un bail.
 *
 * Flow en 3 étapes :
 *   1. Récap du bail (titres, loyer, durée, clauses)
 *   2. Lecture + mention "Lu et approuvé" cochée
 *   3. Canvas de signature + nom confirmé + submit
 *
 * La signature déclenche POST /api/bail/signer qui persiste en DB avec
 * IP, user-agent, hash du bail, timestamp. Audit trail complet eIDAS 1.
 */
export default function BailSignatureModal({
  open,
  onClose,
  onSigned,
  bailData,
  annonceId,
  role,
  nomDefaut = "",
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [accepte, setAccepte] = useState(false)
  const [nom, setNom] = useState(nomDefaut)
  const [mention, setMention] = useState("")
  const [signaturePng, setSignaturePng] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // V32.2 — Lecture obligatoire du PDF avant la signature (audit V31 R1.2).
  // pdfUrl = blob URL généré côté client (ou fichierUrl si bail externe).
  // pdfLu = case cochée par le locataire confirmant la lecture intégrale.
  // pdfLuAt = timestamp ISO du moment où la case est cochée (envoyé à l'API).
  // lectureSecsLeft = countdown UX, empêche le clic réflexe sous MIN_LECTURE_SECONDS.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfLu, setPdfLu] = useState(false)
  const [pdfLuAt, setPdfLuAt] = useState<string | null>(null)
  const [lectureSecsLeft, setLectureSecsLeft] = useState(MIN_LECTURE_SECONDS)
  const blobUrlRef = useRef<string | null>(null)

  // Hash SHA-256 du bail (intégrité) — calculé côté client
  const bailHash = useMemo(() => {
    // hash léger (pas cryptographiquement fort côté client — vérification visuelle)
    const s = JSON.stringify(bailData)
    let hash = 0
    for (let i = 0; i < s.length; i++) {
      const chr = s.charCodeAt(i)
      hash = (hash << 5) - hash + chr
      hash |= 0
    }
    return `bail-${Math.abs(hash).toString(16)}-${s.length}`
  }, [bailData])

  const loyer = (bailData.loyerHC || 0) + (bailData.charges || 0)
  const dureeAns =
    bailData.duree >= 12
      ? `${Math.round(bailData.duree / 12)} an${bailData.duree >= 24 ? "s" : ""}`
      : `${bailData.duree} mois`
  const dateDebut = bailData.dateDebut
    ? new Date(bailData.dateDebut).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : ""

  function reset() {
    setStep(1)
    setAccepte(false)
    setMention("")
    setSignaturePng(null)
    setError(null)
    setSubmitting(false)
    setPdfLu(false)
    setPdfLuAt(null)
    setLectureSecsLeft(MIN_LECTURE_SECONDS)
  }

  // V32.2 — Génère le PDF blob à l'ouverture de la modale (ou utilise l'URL
  // externe si bail importé). Cleanup blob URL à la fermeture.
  useEffect(() => {
    if (!open) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      setPdfUrl(null)
      setPdfError(null)
      return
    }
    if (bailData.fichierUrl) {
      setPdfUrl(bailData.fichierUrl)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { blob } = await genererBailPDFBlob(bailData)
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setPdfUrl(url)
      } catch (e) {
        if (cancelled) return
        console.error("[BailSignatureModal] PDF blob error:", e)
        setPdfError("Impossible de générer le PDF — contactez le support.")
      }
    })()
    return () => { cancelled = true }
  }, [open, bailData])

  // V32.2 — Countdown lecture minimum (empêche clic réflexe).
  useEffect(() => {
    if (!open || step !== 1) return
    if (lectureSecsLeft <= 0) return
    const t = setInterval(() => {
      setLectureSecsLeft(s => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [open, step, lectureSecsLeft])

  function handlePdfLuChange(checked: boolean) {
    setPdfLu(checked)
    if (checked && !pdfLuAt) {
      setPdfLuAt(new Date().toISOString())
    }
  }

  function close() {
    reset()
    onClose()
  }

  async function submit() {
    if (!signaturePng) {
      setError("Veuillez signer avant de valider.")
      return
    }
    if (nom.trim().length < 2) {
      setError("Nom requis.")
      return
    }
    if (!/lu et approuv/i.test(mention)) {
      setError('La mention doit contenir "Lu et approuvé".')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/bail/signer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annonceId,
          role,
          nom: nom.trim(),
          mention: mention.trim(),
          signaturePng,
          bailHash,
          pdfLuAt, // V32.2 — preuve consentement éclairé
        }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error || "Erreur serveur — réessayez")
        setSubmitting(false)
        return
      }
      onSigned()
      close()
    } catch (e) {
      setError("Connexion interrompue — réessayez")
      setSubmitting(false)
    }
  }

  const roleLabel =
    role === "locataire"
      ? "Locataire"
      : role === "bailleur"
        ? "Bailleur"
        : "Garant"

  const footerCommon = (
    <>
      <button
        onClick={close}
        disabled={submitting}
        style={{
          background: "white",
          border: "1px solid #EAE6DF",
          color: "#111",
          borderRadius: 999,
          padding: "10px 22px",
          fontWeight: 700,
          fontSize: 14,
          cursor: submitting ? "not-allowed" : "pointer",
          fontFamily: "inherit",
        }}
      >
        Annuler
      </button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Signature électronique — ${roleLabel}`}
      maxWidth={680}
      strict={submitting}
      footer={
        step === 1 ? (
          <>
            {footerCommon}
            <button
              onClick={() => setStep(2)}
              disabled={!pdfLu}
              style={{
                background: pdfLu ? "#111" : "#EAE6DF",
                color: pdfLu ? "white" : "#8a8477",
                border: "none",
                borderRadius: 999,
                padding: "10px 22px",
                fontWeight: 700,
                fontSize: 14,
                cursor: pdfLu ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              Poursuivre →
            </button>
          </>
        ) : step === 2 ? (
          <>
            {footerCommon}
            <button
              onClick={() => setStep(3)}
              disabled={!accepte}
              style={{
                background: accepte ? "#111" : "#EAE6DF",
                color: accepte ? "white" : "#8a8477",
                border: "none",
                borderRadius: 999,
                padding: "10px 22px",
                fontWeight: 700,
                fontSize: 14,
                cursor: accepte ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              Je suis prêt à signer →
            </button>
          </>
        ) : (
          <>
            {footerCommon}
            <button
              onClick={submit}
              disabled={!signaturePng || submitting}
              style={{
                background: signaturePng && !submitting ? "#15803d" : "#EAE6DF",
                color: signaturePng && !submitting ? "white" : "#8a8477",
                border: "none",
                borderRadius: 999,
                padding: "10px 22px",
                fontWeight: 700,
                fontSize: 14,
                cursor: signaturePng && !submitting ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {submitting ? "Signature en cours…" : "✓ Signer le bail"}
            </button>
          </>
        )
      }
    >
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map(s => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: s <= step ? "#111" : "#EAE6DF",
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>

      {/* STEP 1 — Récap */}
      {step === 1 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>
            1. Récapitulatif du bail
          </h3>
          <p style={{ color: "#8a8477", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Lisez attentivement les termes du bail avant de signer.
          </p>

          <div
            style={{
              background: "#F7F4EF",
              borderRadius: 14,
              padding: "16px 20px",
              fontSize: 14,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              rowGap: 10,
              columnGap: 20,
              alignItems: "center",
            }}
          >
            <span style={{ color: "#8a8477", fontSize: 12 }}>Bien</span>
            <span style={{ fontWeight: 700 }}>
              {bailData.titreBien} — {bailData.villeBien}
            </span>

            <span style={{ color: "#8a8477", fontSize: 12 }}>Type</span>
            <span>
              {bailData.type === "meuble"
                ? "Bail meublé"
                : "Bail non meublé (vide)"}
            </span>

            <span style={{ color: "#8a8477", fontSize: 12 }}>Durée</span>
            <span>{dureeAns}</span>

            <span style={{ color: "#8a8477", fontSize: 12 }}>Début</span>
            <span>{dateDebut}</span>

            <span style={{ color: "#8a8477", fontSize: 12 }}>Loyer (CC)</span>
            <span style={{ fontWeight: 700 }}>
              {loyer.toLocaleString("fr-FR")} €/mois
            </span>

            <span style={{ color: "#8a8477", fontSize: 12 }}>Dépôt garantie</span>
            <span>{(bailData.caution || 0).toLocaleString("fr-FR")} €</span>

            <span style={{ color: "#8a8477", fontSize: 12 }}>Bailleur</span>
            <span>{bailData.nomBailleur}</span>

            <span style={{ color: "#8a8477", fontSize: 12 }}>Locataire</span>
            <span>{bailData.nomLocataire || bailData.emailLocataire}</span>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "12px 16px",
              background: "#EEF3FB",
              border: "1px solid #D7E3F4",
              borderRadius: 12,
              fontSize: 12,
              color: "#1d4ed8",
              lineHeight: 1.6,
            }}
          >
            💡 La signature électronique est juridiquement valable en France
            (art. 1366 du Code civil + règlement UE 910/2014 eIDAS). Votre
            signature + votre identité + timestamp + IP sont horodatés et
            archivés.
          </div>

          {/* V32.2 — Lecture obligatoire du PDF avant signature.
              Audit V31 R1.2 : avant cette feature, le locataire signait
              sans avoir vu le PDF. Risque légal article 1188 Code civil
              (consentement éclairé). */}
          <div style={{ marginTop: 22 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px", color: "#111" }}>
              Lisez le bail intégral avant de poursuivre
            </h4>
            <p style={{ fontSize: 12, color: "#8a8477", margin: "0 0 12px", lineHeight: 1.6 }}>
              Le bail est un contrat juridiquement contraignant. Prenez le temps
              de lire chaque clause avant de cocher la confirmation.
            </p>

            <div
              style={{
                background: "#EAE6DF",
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
                height: 380,
              }}
            >
              {pdfUrl ? (
                <iframe
                  src={pdfUrl + (bailData.fichierUrl ? "" : "#toolbar=1&view=FitH")}
                  title="Bail à lire avant signature"
                  style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
                />
              ) : pdfError ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#b91c1c",
                    fontSize: 13,
                    padding: 20,
                    textAlign: "center",
                  }}
                >
                  {pdfError}
                </div>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8a8477",
                    fontSize: 13,
                  }}
                >
                  Génération du PDF en cours…
                </div>
              )}
            </div>

            {pdfUrl && (
              <p style={{ fontSize: 11, color: "#8a8477", margin: "8px 0 0", textAlign: "right" }}>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>
                  Ouvrir en grand dans un nouvel onglet ↗
                </a>
              </p>
            )}

            <label
              style={{
                marginTop: 14,
                display: "flex",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 12,
                background: pdfLu ? "#F0FAEE" : "#FBF6EA",
                border: `1px solid ${pdfLu ? "#86efac" : "#EADFC6"}`,
                cursor: lectureSecsLeft > 0 ? "not-allowed" : "pointer",
                alignItems: "flex-start",
                opacity: lectureSecsLeft > 0 ? 0.7 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={pdfLu}
                disabled={lectureSecsLeft > 0 || !pdfUrl}
                onChange={e => handlePdfLuChange(e.target.checked)}
                style={{ marginTop: 3, cursor: lectureSecsLeft > 0 ? "not-allowed" : "pointer", accentColor: "#15803d" }}
              />
              <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.55, color: "#111" }}>
                <strong>J&apos;ai lu le bail intégralement</strong> et je comprends
                ses clauses, durée, loyer et obligations.
                {lectureSecsLeft > 0 && (
                  <span style={{ display: "block", fontSize: 11.5, color: "#a16207", marginTop: 4 }}>
                    Disponible dans {lectureSecsLeft}s — prenez le temps de lire.
                  </span>
                )}
              </div>
            </label>
          </div>
        </div>
      )}

      {/* STEP 2 — Acceptation */}
      {step === 2 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>
            2. Acceptation des termes
          </h3>
          <p style={{ color: "#8a8477", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Confirmez avoir lu le bail et accepter ses clauses.
          </p>

          <label
            style={{
              display: "flex",
              gap: 12,
              padding: "16px 18px",
              borderRadius: 14,
              background: accepte ? "#F0FAEE" : "#F7F4EF",
              border: `1px solid ${accepte ? "#86efac" : "#EAE6DF"}`,
              cursor: "pointer",
              alignItems: "flex-start",
            }}
          >
            <input
              type="checkbox"
              checked={accepte}
              onChange={e => setAccepte(e.target.checked)}
              style={{ marginTop: 3, cursor: "pointer", accentColor: "#15803d" }}
            />
            <div style={{ flex: 1, fontSize: 14, lineHeight: 1.6, color: "#111" }}>
              <strong>Je reconnais avoir pris connaissance</strong> du contenu
              complet du bail annexé à cette conversation, avoir été informé(e)
              des clauses particulières et des obligations de chaque partie,
              et accepter les termes du présent contrat en tant que{" "}
              <strong>{roleLabel.toLowerCase()}</strong>.
            </div>
          </label>

          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              Résumé des obligations principales :
            </h4>
            <ul
              style={{
                paddingLeft: 18,
                margin: 0,
                fontSize: 13,
                color: "#111",
                lineHeight: 1.7,
              }}
            >
              {role === "locataire" && (
                <>
                  <li>Payer le loyer et les charges aux termes convenus</li>
                  <li>
                    Souscrire une assurance habitation couvrant les risques
                    locatifs
                  </li>
                  <li>
                    Respecter la destination du bien et les règles de vie du bail
                  </li>
                  <li>
                    Rendre le bien en l&apos;état lors de la sortie (usure normale
                    exceptée)
                  </li>
                </>
              )}
              {role === "bailleur" && (
                <>
                  <li>Délivrer un logement décent et en bon état</li>
                  <li>Assurer la jouissance paisible du logement</li>
                  <li>Effectuer les grosses réparations non locatives</li>
                  <li>Remettre les quittances de loyer gratuitement</li>
                </>
              )}
              {role === "garant" && (
                <>
                  <li>
                    Se porter garant solidaire du paiement du loyer et des
                    charges
                  </li>
                  <li>
                    S&apos;engager à hauteur du montant indiqué pour la durée du
                    bail
                  </li>
                  <li>
                    Être notifié en cas de défaillance du locataire principal
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* STEP 3 — Signature */}
      {step === 3 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>
            3. Signez votre bail
          </h3>
          <p style={{ color: "#8a8477", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Confirmez votre identité, reproduisez la mention manuscrite, et
            signez dans le cadre.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#8a8477",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Votre nom complet *
              </label>
              <input
                value={nom}
                onChange={e => setNom(e.target.value)}
                placeholder="Prénom Nom"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1px solid #EAE6DF",
                  borderRadius: 10,
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  color: "#111",
                  background: "white",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#8a8477",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Mention manuscrite *
              </label>
              <input
                value={mention}
                onChange={e => setMention(e.target.value)}
                placeholder="Lu et approuvé, bon pour accord"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1px solid #EAE6DF",
                  borderRadius: 10,
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  color: "#111",
                  background: "white",
                  fontStyle: "italic",
                }}
              />
              <p style={{ fontSize: 11, color: "#8a8477", marginTop: 4, lineHeight: 1.5 }}>
                Recopiez exactement : <em>Lu et approuvé, bon pour accord</em>
                {role === "garant" && " — ajoutez 'caution solidaire à hauteur de [montant] €'"}
              </p>
            </div>

            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#8a8477",
                  display: "block",
                  marginBottom: 8,
                }}
              >
                Signature *
              </label>
              <SignatureCanvas onChange={setSignaturePng} />
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#fef2f2",
                  border: "1px solid #F4C9C9",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#b91c1c",
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                padding: "10px 14px",
                background: "#F7F4EF",
                borderRadius: 10,
                fontSize: 11,
                color: "#8a8477",
                lineHeight: 1.6,
              }}
            >
              📋 <strong>Audit trail :</strong> votre IP, user-agent, timestamp
              et hash du bail ({bailHash.slice(0, 16)}…) seront archivés comme
              preuve de l&apos;acte de signature. Vous recevrez une confirmation
              par message.
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
