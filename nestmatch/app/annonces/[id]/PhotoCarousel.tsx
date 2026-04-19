"use client"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"

export default function PhotoCarousel({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Navigation clavier quand lightbox ouverte
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false)
      else if (e.key === "ArrowLeft") setIdx(i => (i - 1 + photos.length) % photos.length)
      else if (e.key === "ArrowRight") setIdx(i => (i + 1) % photos.length)
    }
    window.addEventListener("keydown", onKey)
    // bloquer le scroll en arrière-plan
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [lightboxOpen, photos.length])

  if (!photos || photos.length === 0) return (
    <div style={{ height: 380, background: "linear-gradient(135deg, #e5e7eb, #d1d5db)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
      <span style={{ color: "#9ca3af", fontSize: 16 }}>Aucune photo disponible</span>
    </div>
  )

  const lightbox = mounted && lightboxOpen ? createPortal(
    <div
      role="dialog"
      aria-label="Galerie photos"
      onClick={() => setLightboxOpen(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', sans-serif" }}
    >
      <button
        aria-label="Fermer"
        onClick={e => { e.stopPropagation(); setLightboxOpen(false) }}
        style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 44, height: 44, color: "white", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
      >
        ×
      </button>
      {/* Lightbox : <img> conservé car max-dimensions CSS incompatibles avec
          les width/height fixes de next/image. Pas LCP-critical (après clic). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[idx]}
        alt={`Photo ${idx + 1}`}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 12px 48px rgba(0,0,0,0.5)" }}
      />
      {photos.length > 1 && (
        <>
          <button
            aria-label="Précédent"
            onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + photos.length) % photos.length) }}
            style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 52, height: 52, color: "white", fontSize: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
          >
            ‹
          </button>
          <button
            aria-label="Suivant"
            onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % photos.length) }}
            style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 52, height: 52, color: "white", fontSize: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}
          >
            ›
          </button>
          <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <span style={{ background: "rgba(0,0,0,0.6)", color: "white", fontSize: 13, fontWeight: 700, padding: "6px 14px", borderRadius: 999 }}>
              {idx + 1} / {photos.length}
            </span>
          </div>
        </>
      )}
    </div>,
    document.body
  ) : null

  return (
    <>
      <div
        style={{ position: "relative", height: 380, borderRadius: 20, overflow: "hidden", marginBottom: 28, background: "#000", cursor: "zoom-in" }}
        onMouseEnter={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "1"))}
        onMouseLeave={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "0"))}
        onClick={() => setLightboxOpen(true)}
      >
        <Image
          src={photos[idx]}
          alt={`Photo ${idx + 1}`}
          fill
          sizes="(max-width: 1024px) 100vw, 800px"
          priority={idx === 0}
          style={{ objectFit: "cover", display: "block" }}
        />

        {photos.length > 1 && (
          <>
            <button
              className="pnav"
              aria-label="Photo précédente"
              onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + photos.length) % photos.length) }}
              style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.9)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 20, fontWeight: 700, opacity: 0, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ‹
            </button>
            <button
              className="pnav"
              aria-label="Photo suivante"
              onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % photos.length) }}
              style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.9)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 20, fontWeight: 700, opacity: 0, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ›
            </button>

            {/* Dots */}
            <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
              {photos.map((_, i) => (
                <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }}
                  style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 999, background: i === idx ? "white" : "rgba(255,255,255,0.5)", cursor: "pointer", transition: "all 0.2s" }} />
              ))}
            </div>

            {/* Compteur */}
            <span style={{ position: "absolute", bottom: 16, right: 16, background: "rgba(0,0,0,0.5)", color: "white", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>
              {idx + 1} / {photos.length}
            </span>
          </>
        )}

        {/* Hint zoom (coin haut droit) */}
        <span style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.55)", color: "white", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, pointerEvents: "none" }}>
          Cliquez pour agrandir
        </span>
      </div>
      {lightbox}
    </>
  )
}
