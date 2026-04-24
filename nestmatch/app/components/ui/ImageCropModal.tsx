"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Cropper from "react-easy-crop"
import type { Area } from "react-easy-crop"
import { km, KMButton, KMButtonOutline, KMEyebrow } from "./km"

/**
 * ImageCropModal — modal de recadrage d'image avant upload.
 *
 * Flow :
 *  1. Parent passe un `file` (File) à cropper
 *  2. User ajuste zoom + position + ratio
 *  3. Valider → produit un Blob JPEG (quality 0.85, max 2000×2000)
 *  4. Annuler ou "Upload sans recadrer" → renvoie le fichier original
 *
 * Ratios :
 *  - 4:3 (recommandé, cohérent cards /annonces + hero fiche)
 *  - 1:1, 16:9, libre
 *
 * Mobile : touch drag + pinch-to-zoom natif via react-easy-crop.
 * Accessibilité : Escape ferme (via onCancel).
 */

type Ratio = { label: string; value: number | undefined } // undefined = libre

const RATIOS: Ratio[] = [
  { label: "4 : 3", value: 4 / 3 },
  { label: "1 : 1", value: 1 },
  { label: "16 : 9", value: 16 / 9 },
  { label: "Libre", value: undefined },
]

const OUTPUT_MAX = 2000
const OUTPUT_QUALITY = 0.85

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

async function getCroppedBlob(
  dataUrl: string,
  pixelCrop: Area,
  originalType: string,
): Promise<Blob> {
  const image = await dataUrlToImage(dataUrl)
  const scale = Math.min(1, OUTPUT_MAX / Math.max(pixelCrop.width, pixelCrop.height))
  const outW = Math.round(pixelCrop.width * scale)
  const outH = Math.round(pixelCrop.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D indisponible")
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outW, outH,
  )

  const mime = originalType === "image/png" ? "image/jpeg" : "image/jpeg"
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => { if (b) resolve(b); else reject(new Error("Blob vide")) },
      mime,
      OUTPUT_QUALITY,
    )
  })
}

export default function ImageCropModal({
  file,
  onCancel,
  onCropped,
  onSkipCrop,
  defaultRatio = 4 / 3,
}: {
  file: File | null
  onCancel: () => void
  onCropped: (blob: Blob, originalName: string) => void
  onSkipCrop?: () => void
  defaultRatio?: number
}) {
  const [mounted, setMounted] = useState(false)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [ratio, setRatio] = useState<number | undefined>(defaultRatio)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialFileRef = useRef<File | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    let cancelled = false
    if (!file) {
      setDataUrl(null)
      return
    }
    initialFileRef.current = file
    setError(null)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    setRatio(defaultRatio)
    fileToDataUrl(file).then(url => { if (!cancelled) setDataUrl(url) }).catch(() => {
      if (!cancelled) setError("Impossible de lire le fichier image")
    })
    return () => { cancelled = true }
  }, [file, defaultRatio])

  useEffect(() => {
    if (!file) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [file, onCancel])

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setPixelCrop(pixels)
  }, [])

  function reset() {
    setZoom(1)
    setCrop({ x: 0, y: 0 })
  }

  async function validate() {
    if (!dataUrl || !pixelCrop || !file) return
    setBusy(true)
    setError(null)
    try {
      const blob = await getCroppedBlob(dataUrl, pixelCrop, file.type)
      onCropped(blob, file.name)
    } catch (e) {
      console.error("[crop] validation failed", e)
      setError("Le recadrage a échoué, veuillez réessayer ou cliquer sur « Sans recadrer ».")
      setBusy(false)
    }
  }

  const footerBtnSize = useMemo(() => ({ padding: "10px 22px", fontSize: 11 }), [])

  if (!mounted || !file) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recadrer l'image"
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(17,17,17,0.72)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        zIndex: 10500,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: km.white,
          borderRadius: 20,
          width: "min(680px, 96vw)",
          maxHeight: "92vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 22px",
          borderBottom: `1px solid ${km.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <KMEyebrow>Recadrer l&apos;image</KMEyebrow>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            style={{
              background: "none", border: "none", fontSize: 22,
              color: km.muted, cursor: "pointer", lineHeight: 1,
              fontFamily: "inherit",
            }}
          >×</button>
        </div>

        {/* Cropper area */}
        <div style={{ position: "relative", background: "#111", height: 360, flexShrink: 0 }}>
          {dataUrl ? (
            <Cropper
              image={dataUrl}
              crop={crop}
              zoom={zoom}
              aspect={ratio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition
              objectFit="contain"
              zoomSpeed={0.3}
              maxZoom={3}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
              Chargement…
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ padding: "16px 22px", borderTop: `1px solid ${km.line}`, flexShrink: 0 }}>
          {/* Ratios */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {RATIOS.map(r => {
              const active = r.value === ratio
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setRatio(r.value)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.6px",
                    textTransform: "uppercase",
                    border: `1px solid ${active ? km.ink : km.line}`,
                    background: active ? km.ink : km.white,
                    color: active ? km.white : km.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >{r.label}</button>
              )
            })}
          </div>

          {/* Zoom slider */}
          <label style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", minWidth: 42 }}>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: km.ink, cursor: "pointer" }}
              aria-label="Zoom"
            />
          </label>

          {error && (
            <p style={{ fontSize: 12, color: km.errText, background: km.errBg, border: `1px solid ${km.errLine}`, padding: "8px 12px", borderRadius: 8, marginTop: 10, marginBottom: 0 }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px",
          borderTop: `1px solid ${km.line}`,
          background: km.beige,
          display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap",
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            style={{
              background: "none", border: "none",
              fontSize: 12, fontWeight: 600, color: km.muted,
              textTransform: "uppercase", letterSpacing: "0.6px",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: busy ? 0.5 : 1,
            }}
          >Recommencer</button>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {onSkipCrop && (
              <button
                type="button"
                onClick={onSkipCrop}
                disabled={busy}
                style={{
                  background: "none", border: `1px solid ${km.line}`,
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontSize: 11, fontWeight: 600,
                  color: km.muted, textTransform: "uppercase", letterSpacing: "0.6px",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >Sans recadrer</button>
            )}
            <KMButtonOutline onClick={onCancel} disabled={busy} style={footerBtnSize}>
              Annuler
            </KMButtonOutline>
            <KMButton onClick={validate} disabled={busy || !pixelCrop || !dataUrl} style={footerBtnSize}>
              {busy ? "Export…" : "Valider"}
            </KMButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
