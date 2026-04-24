"use client"
import { useState, useEffect } from "react"
import Image from "next/image"
import Lightbox from "../../components/ui/Lightbox"
import { useResponsive } from "../../hooks/useResponsive"

/**
 * PhotoCarousel — 3 modes de rendu selon contexte :
 *
 *  - Mobile (<768) : carousel swipeable plein largeur (1 grande photo + nav
 *    + dots + compteur). Plus ergonomique qu'un mini-grid tactile.
 *  - Desktop/tablet + ≥3 photos : layout "SeLoger" — 1 grande à gauche (2/3)
 *    + 2 vignettes stackées à droite (1/3). "+N" overlay sur la 3e si >3
 *    photos pour indiquer qu'il y en a plus (cliquer ouvre la lightbox).
 *  - Desktop/tablet + <3 photos : fallback layout mobile (1 grande photo).
 *
 * Toujours : clic n'importe où → Lightbox générique (composant réutilisable
 * app/components/ui/Lightbox.tsx). next/image optimisé sur la grande photo
 * (priority=first paint).
 */
export default function PhotoCarousel({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  const { isMobile } = useResponsive()

  useEffect(() => { setMounted(true) }, [])

  if (!photos || photos.length === 0) return (
    <div style={{ height: 380, background: "linear-gradient(135deg, #EAE6DF, #EAE6DF)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
      <span style={{ color: "#8a8477", fontSize: 16 }}>Aucune photo disponible</span>
    </div>
  )

  function openLightboxAt(i: number) {
    setLightboxIdx(i)
    setLightboxOpen(true)
  }

  const lightbox = (
    <Lightbox
      photos={photos}
      initialIndex={lightboxIdx}
      open={lightboxOpen}
      onClose={() => setLightboxOpen(false)}
    />
  )

  // ─── Mode mobile OU fallback <3 photos : carousel classique ──────
  // Important : avant mount, `useResponsive` renvoie width=1200 (SSR défaut)
  // donc isMobile=false. Si on laissait la bascule mobile/desktop piloter
  // le premier render client, le HTML SSR (qui ne connaît pas le vrai
  // viewport) différerait du HTML client post-mesure → React error #418.
  // On force donc le layout carousel classique tant que `mounted` est
  // false. Après mount, on bascule sur 2/1 si desktop + ≥3 photos.
  if (!mounted || isMobile || photos.length < 3) {
    return (
      <>
        <div
          style={{ position: "relative", height: isMobile ? 280 : 420, borderRadius: 20, overflow: "hidden", marginBottom: 28, background: "#000", cursor: "zoom-in" }}
          onMouseEnter={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "1"))}
          onMouseLeave={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "0"))}
          onClick={() => openLightboxAt(idx)}
        >
          <Image
            src={photos[idx]}
            alt={`Photo ${idx + 1}`}
            fill
            sizes="(max-width: 768px) 100vw, 800px"
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

          <span style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.55)", color: "white", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, pointerEvents: "none" }}>
            Cliquez pour agrandir
          </span>
        </div>
        {lightbox}
      </>
    )
  }

  // ─── Desktop/tablet + ≥3 photos : layout 2/1 ────────────────────────
  const extraCount = photos.length - 3 // photos supplémentaires au-delà des 3 visibles
  return (
    <>
      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 12,
        height: 480,
        marginBottom: 28,
      }}>
        {/* Grande photo gauche */}
        <div
          onClick={() => openLightboxAt(0)}
          style={{ position: "relative", borderRadius: 20, overflow: "hidden", cursor: "zoom-in", background: "#000" }}
        >
          <Image
            src={photos[0]}
            alt="Photo principale"
            fill
            sizes="(max-width: 1200px) 60vw, 800px"
            priority
            style={{ objectFit: "cover" }}
          />
          <span style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.55)", color: "white", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, pointerEvents: "none" }}>
            Cliquez pour agrandir
          </span>
        </div>

        {/* 2 vignettes droite, stackées verticalement */}
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 12 }}>
          <div
            onClick={() => openLightboxAt(1)}
            style={{ position: "relative", borderRadius: 20, overflow: "hidden", cursor: "zoom-in", background: "#000" }}
          >
            <Image
              src={photos[1]}
              alt="Photo 2"
              fill
              sizes="(max-width: 1200px) 30vw, 400px"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div
            onClick={() => openLightboxAt(2)}
            style={{ position: "relative", borderRadius: 20, overflow: "hidden", cursor: "zoom-in", background: "#000" }}
          >
            <Image
              src={photos[2]}
              alt="Photo 3"
              fill
              sizes="(max-width: 1200px) 30vw, 400px"
              style={{ objectFit: "cover" }}
            />
            {/* Overlay "+N" si plus de 3 photos */}
            {extraCount > 0 && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white",
                fontSize: 24, fontWeight: 700, letterSpacing: "-0.3px",
                pointerEvents: "none",
              }}>
                +{extraCount}
              </div>
            )}
          </div>
        </div>
      </div>
      {lightbox}
    </>
  )
}
