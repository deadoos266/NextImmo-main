"use client"
import { useState } from "react"
import Modal from "./ui/Modal"
import { supabase } from "../../lib/supabase"

interface Props {
  open: boolean
  onClose: () => void
  onUploaded: (result: { fichierUrl: string; dateDebut: string; duree: number; type: "vide" | "meuble" }) => Promise<void>
  proprioEmail: string
  locataireEmail: string
  annonceId: number
  titreBien: string
  villeBien: string
  defaultType?: "vide" | "meuble"
}

/**
 * Modale d'import d'un bail externe (PDF déjà rédigé ailleurs : avocat, autre
 * appli, etc.). Upload le PDF sur Supabase Storage bucket `baux`, puis appelle
 * onUploaded avec l'URL publique et les métadonnées minimales.
 *
 * Le parent se charge ensuite d'insérer le message [BAIL_CARD] enrichi du
 * champ `fichierUrl` + update annonces.statut = "bail_envoye".
 */
export default function UploadBailModal({
  open,
  onClose,
  onUploaded,
  proprioEmail,
  locataireEmail,
  annonceId,
  titreBien,
  villeBien,
  defaultType = "vide",
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [dateDebut, setDateDebut] = useState("")
  const [duree, setDuree] = useState(defaultType === "meuble" ? "12" : "36")
  const [type, setType] = useState<"vide" | "meuble">(defaultType)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFile(null)
    setDateDebut("")
    setDuree(defaultType === "meuble" ? "12" : "36")
    setType(defaultType)
    setError(null)
    setUploading(false)
  }

  function close() {
    if (!uploading) {
      reset()
      onClose()
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const f = e.target.files?.[0]
    if (!f) {
      setFile(null)
      return
    }
    if (f.type !== "application/pdf") {
      setError("Le fichier doit être un PDF.")
      return
    }
    if (f.size > 15 * 1024 * 1024) {
      setError("Le fichier dépasse 15 Mo — compressez-le avant d'uploader.")
      return
    }
    setFile(f)
  }

  async function submit() {
    if (!file) {
      setError("Sélectionnez un PDF.")
      return
    }
    if (!dateDebut) {
      setError("Date de début requise.")
      return
    }
    if (!locataireEmail) {
      setError("Aucun locataire associé à ce bien.")
      return
    }
    setUploading(true)
    setError(null)
    try {
      const folder = proprioEmail.toLowerCase()
      const path = `${folder}/bail-${annonceId}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from("baux")
        .upload(path, file, { contentType: "application/pdf", upsert: false })
      if (upErr) {
        setError(`Erreur d'upload : ${upErr.message}`)
        setUploading(false)
        return
      }
      const { data: pub } = supabase.storage.from("baux").getPublicUrl(path)
      await onUploaded({
        fichierUrl: pub.publicUrl,
        dateDebut,
        duree: Number(duree),
        type,
      })
      reset()
      onClose()
    } catch (err) {
      setError("Erreur inattendue — réessayez.")
      setUploading(false)
    }
  }

  const canSubmit = !!file && !!dateDebut && !!locataireEmail && !uploading

  const _ = { annonceId, titreBien, villeBien } // réserve pour contexte futur
  void _

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importer votre propre bail"
      maxWidth={560}
      strict={uploading}
      footer={
        <>
          <button
            onClick={close}
            disabled={uploading}
            style={{
              background: "white",
              border: "1.5px solid #e5e7eb",
              color: "#111",
              borderRadius: 999,
              padding: "10px 22px",
              fontWeight: 700,
              fontSize: 14,
              cursor: uploading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "#111" : "#e5e7eb",
              color: canSubmit ? "white" : "#9ca3af",
              border: "none",
              borderRadius: 999,
              padding: "10px 22px",
              fontWeight: 700,
              fontSize: 14,
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {uploading ? "Upload…" : "Envoyer au locataire"}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
        Utilisez cette option si vous avez déjà rédigé votre bail ailleurs (avocat,
        autre application, modèle téléchargé). Le PDF sera envoyé au locataire qui
        pourra le télécharger et le signer électroniquement.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
        {/* File input */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 8 }}>
            Fichier PDF *
          </label>
          <div
            style={{
              border: `2px dashed ${file ? "#86efac" : "#e5e7eb"}`,
              borderRadius: 14,
              padding: "20px 16px",
              textAlign: "center",
              background: file ? "#f0fdf4" : "#fafafa",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                cursor: "pointer",
              }}
            />
            {file ? (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>{file.name}</div>
                <div style={{ fontSize: 11, color: "#15803d", marginTop: 4 }}>
                  {(file.size / 1024 / 1024).toFixed(2)} Mo — Cliquez pour changer
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
                  Cliquez pour sélectionner un PDF
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  Jusqu&apos;à 15 Mo
                </div>
              </>
            )}
          </div>
        </div>

        {/* Type */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 8 }}>
            Type de bail
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["vide", "meuble"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t)
                  setDuree(t === "meuble" ? "12" : "36")
                }}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: type === t ? "#111" : "white",
                  color: type === t ? "white" : "#111",
                  border: `1.5px solid ${type === t ? "#111" : "#e5e7eb"}`,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t === "vide" ? "Location vide" : "Location meublée"}
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>
              Date de début *
            </label>
            <input
              type="date"
              value={dateDebut}
              onChange={e => setDateDebut(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #e5e7eb",
                borderRadius: 10,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                color: "#111",
                background: "white",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>
              Durée
            </label>
            <select
              value={duree}
              onChange={e => setDuree(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #e5e7eb",
                borderRadius: 10,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                background: "white",
                color: "#111",
              }}
            >
              {type === "meuble"
                ? [9, 12, 24].map(v => (
                    <option key={v} value={v}>
                      {v} mois
                    </option>
                  ))
                : [36, 72].map(v => (
                    <option key={v} value={v}>
                      {v / 12} ans
                    </option>
                  ))}
            </select>
          </div>
        </div>

        {/* Locataire info */}
        <div
          style={{
            padding: "10px 14px",
            background: "#f9fafb",
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Sera envoyé à</div>
          <div style={{ fontWeight: 700, color: "#111" }}>{locataireEmail || "(aucun locataire défini)"}</div>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1.5px solid #fecaca",
              borderRadius: 10,
              fontSize: 13,
              color: "#b91c1c",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
