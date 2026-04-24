"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * Lightbox générique — modal plein écran pour agrandir une image ou
 * naviguer dans une galerie.
 *
 * Usage:
 *   const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 })
 *   ...
 *   <Lightbox photos={photos} initialIndex={lightbox.index} open={lightbox.open} onClose={() => setLightbox(s => ({ ...s, open: false }))} />
 *
 * Features :
 *  - createPortal vers document.body (évite les conflits de z-index/overflow)
 *  - Escape ferme ; ← / → navigue
 *  - Clic sur le fond ferme ; clic sur l'image empêche la propagation
 *  - Swipe horizontal sur mobile (touchstart/touchend, seuil 50 px)
 *  - body scroll lock pendant l'ouverture
 *  - Support caption optionnel (ex. "Photo 3 / 8 — cuisine")
 *  - z-index 10000 — au-dessus des modals standards
 *  - Fallback SSR / pré-mount : ne rend rien (portal nécessite window)
 */

export type LightboxPhoto = string | { src: string; alt?: string }

function photoSrc(p: LightboxPhoto): string { return typeof p === "string" ? p : p.src }
function photoAlt(p: LightboxPhoto, idx: number): string {
  return typeof p === "string" ? `Photo ${idx + 1}` : (p.alt || `Photo ${idx + 1}`)
}

export default function Lightbox({
  photos,
  initialIndex = 0,
  open,
  onClose,
  caption,
}: {
  photos: LightboxPhoto[]
  initialIndex?: number
  open: boolean
  onClose: () => void
  caption?: (index: number, total: number) => React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const [idx, setIdx] = useState(initialIndex)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (open) setIdx(initialIndex) }, [open, initialIndex])

  useEffect(() => {
    if (!open) return
    const total = photos.length
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") setIdx(i => (i - 1 + total) % total)
      else if (e.key === "ArrowRight") setIdx(i => (i + 1) % total)
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, photos.length])

  if (!mounted || !open || photos.length === 0) return null

  const total = photos.length
  const src = photoSrc(photos[idx])
  const alt = photoAlt(photos[idx], idx)

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0]?.clientX ?? null }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current
    if (start === null) return
    const endX = e.changedTouches[0]?.clientX ?? start
    const dx = endX - start
    if (Math.abs(dx) > 50 && total > 1) {
      setIdx(i => (dx < 0 ? (i + 1) % total : (i - 1 + total) % total))
    }
    touchStartX.current = null
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu agrandi"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.92)",
        zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        style={{
          position: "absolute", top: 20, right: 20,
          background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
          width: 44, height: 44, color: "white", fontSize: 24, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "inherit",
        }}
      >×</button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        loading="eager"
        style={{
          maxWidth: "94vw", maxHeight: "86vh",
          objectFit: "contain", borderRadius: 8,
          boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
          userSelect: "none",
        }}
      />

      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Précédent"
            onClick={(e) => { e.stopPropagation(); setIdx(i => (i - 1 + total) % total) }}
            style={{
              position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
              width: 52, height: 52, color: "white", fontSize: 28, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "inherit",
            }}
          >‹</button>
          <button
            type="button"
            aria-label="Suivant"
            onClick={(e) => { e.stopPropagation(); setIdx(i => (i + 1) % total) }}
            style={{
              position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
              width: 52, height: 52, color: "white", fontSize: 28, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "inherit",
            }}
          >›</button>
          <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <span style={{ background: "rgba(0,0,0,0.6)", color: "white", fontSize: 13, fontWeight: 700, padding: "6px 14px", borderRadius: 999 }}>
              {caption ? caption(idx, total) : `${idx + 1} / ${total}`}
            </span>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}
