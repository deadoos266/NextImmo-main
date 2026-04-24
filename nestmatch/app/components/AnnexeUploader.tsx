"use client"
import { useRef, useState } from "react"
import { supabase } from "../../lib/supabase"

interface Props {
  label: string
  description?: string
  required?: boolean
  proprioEmail: string
  annonceId: number
  slotKey: string // "dpe" | "erp" | "crep" | "notice" | custom
  current?: { url: string; name: string }
  onChange: (file: { url: string; name: string } | null) => void
}

/**
 * Uploader d'annexe PDF pour un bail. Upload le fichier dans le bucket
 * Supabase `baux` sous le chemin `<email>/bail-<annonceId>-annexe-<slot>.pdf`.
 * Affiche le nom du fichier uploadé + bouton pour changer ou supprimer.
 */
export default function AnnexeUploader({
  label,
  description,
  required,
  proprioEmail,
  annonceId,
  slotKey,
  current,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== "application/pdf") {
      setError("Le fichier doit être un PDF.")
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Fichier > 10 Mo — compressez-le.")
      return
    }
    setUploading(true)
    try {
      const folder = proprioEmail.toLowerCase()
      const path = `${folder}/bail-${annonceId}-annexe-${slotKey}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from("baux")
        .upload(path, f, { contentType: "application/pdf", upsert: false })
      if (upErr) {
        setError(`Upload échoué : ${upErr.message}`)
        return
      }
      const { data: pub } = supabase.storage.from("baux").getPublicUrl(path)
      onChange({ url: pub.publicUrl, name: f.name })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${current ? "#86efac" : required ? "#EADFC6" : "#EAE6DF"}`,
        background: current ? "#F0FAEE" : required ? "#FBF6EA" : "#F7F4EF",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0 }}>
            {label}
            {required && <span style={{ color: "#b91c1c", marginLeft: 4 }}>*</span>}
          </p>
          {description && (
            <p style={{ fontSize: 11, color: "#8a8477", margin: "2px 0 0", lineHeight: 1.5 }}>
              {description}
            </p>
          )}
          {current && (
            <p style={{ fontSize: 12, color: "#15803d", margin: "6px 0 0", fontWeight: 600 }}>
              ✓ {current.name}
            </p>
          )}
          {error && (
            <p style={{ fontSize: 12, color: "#b91c1c", margin: "6px 0 0" }}>{error}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <label
            style={{
              background: current ? "white" : "#111",
              color: current ? "#111" : "white",
              border: `1px solid ${current ? "#111" : "#111"}`,
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: uploading ? "wait" : "pointer",
              fontFamily: "inherit",
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? "Upload…" : current ? "Changer" : "Téléverser"}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              style={{ display: "none" }}
              disabled={uploading}
            />
          </label>
          {current && (
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "white", color: "#111", border: "1px solid #EAE6DF", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" }}
            >
              Voir
            </a>
          )}
          {current && !uploading && (
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ background: "white", color: "#b91c1c", border: "1px solid #F4C9C9", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
