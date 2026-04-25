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
// Clamp le ratio w/h d'un hero :
//   - Portrait (w/h < 0.75, donc h/w > 1.33) → force 3/4 (0.75) pour garder
//     une proportion raisonnable dans la colonne gauche du grid.
//   - Ultra-wide (w/h > 2) → force 16/9 pour éviter la bande étroite.
//   - Sinon : ratio réel.
function clampedAspect(naturalW: number, naturalH: number): string {
  if (!naturalW || !naturalH) return "16 / 10"
  const r = naturalW / naturalH
  if (r < 0.75) return "3 / 4"
  if (r > 2) return "16 / 9"
  return `${naturalW} / ${naturalH}`
}

export default function PhotoCarousel({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  // Ratio mesuré par photo (clé = index). Avant mesure, on utilise 16/10 par défaut
  // (ratio paysage neutre — majoritaire en photo immo).
  const [aspects, setAspects] = useState<Record<number, string>>({})
  const { isMobile } = useResponsive()

  useEffect(() => { setMounted(true) }, [])

  if (!photos || photos.length === 0) return (
    <div style={{
      width: "100%",
      height: 200,
      marginBottom: 20,
      background: "#EAE6DF",
      border: "1px dashed #cec9bd",
      borderRadius: 20,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8a8477" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      <span style={{ color: "#8a8477", fontSize: 13, fontWeight: 500 }}>Aucune photo disponible</span>
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
    // Hero bornes — photo DANS la colonne gauche du grid 2-col (≤800px de large
    // desktop, full-width stack en mobile) :
    //   - aspect-ratio dérivé de la vraie image (clampé 3/4 ↔ 16/9)
    //   - min-height 280px desktop / 240px mobile : photo jamais ridiculement petite
    //   - max-height 520px desktop / 50vh mobile : photo ne bouffe jamais tout l'écran
    //   - width: 100% → épouse naturellement la colonne parent du grid
    //   - object-fit: contain + fond éditorial : image entière, zéro coupe
    const heroAspect = aspects[idx] ?? "16 / 10"
    return (
      <>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: heroAspect,
            minHeight: isMobile ? 240 : 280,
            maxHeight: isMobile ? "50vh" : 520,
            borderRadius: 20,
            overflow: "hidden",
            marginBottom: 20,
            background: "#F7F4EF",
            cursor: "zoom-in",
          }}
          onMouseEnter={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "1"))}
          onMouseLeave={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "0"))}
          onClick={() => openLightboxAt(idx)}
        >
          <Image
            src={photos[idx]}
            alt={`Photo ${idx + 1}`}
            fill
            sizes="(max-width: 768px) 100vw, 1100px"
            priority={idx === 0}
            style={{ objectFit: "contain", display: "block" }}
            onLoad={e => {
              const img = e.currentTarget as HTMLImageElement
              const next = clampedAspect(img.naturalWidth, img.naturalHeight)
              setAspects(prev => (prev[idx] === next ? prev : { ...prev, [idx]: next }))
            }}
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

  // ─── Desktop/tablet + ≥3 photos : layout vignettes verticales gauche + grande droite ──
  // Style Airbnb/Amazon : colonne étroite (88px) à gauche avec toutes les
  // miniatures empilées verticalement, scrollable si trop nombreuses. Cliquer
  // une miniature change la photo principale (sans ouvrir la lightbox).
  // Cliquer la photo principale → lightbox.
  return (
    <>
      <div style={{
        display: "grid",
        gridTemplateColumns: "88px 1fr",
        gap: 12,
        width: "100%",
        height: 480,
        marginBottom: 20,
      }}>
        {/* Colonne miniatures verticales gauche */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: 4,
            scrollbarWidth: "thin",
          }}
          aria-label="Miniatures des photos"
        >
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Voir photo ${i + 1}`}
              aria-pressed={i === idx}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 12,
                overflow: "hidden",
                padding: 0,
                border: i === idx ? "2px solid #111" : "2px solid transparent",
                background: "#F7F4EF",
                cursor: "pointer",
                flexShrink: 0,
                transition: "border-color 0.15s, opacity 0.15s",
                opacity: i === idx ? 1 : 0.78,
              }}
              onMouseEnter={e => { if (i !== idx) e.currentTarget.style.opacity = "1" }}
              onMouseLeave={e => { if (i !== idx) e.currentTarget.style.opacity = "0.78" }}
            >
              <Image
                src={src}
                alt={`Vignette ${i + 1}`}
                fill
                sizes="88px"
                style={{ objectFit: "cover" }}
              />
            </button>
          ))}
        </div>

        {/* Grande photo principale droite */}
        <div
          onClick={() => openLightboxAt(idx)}
          style={{
            position: "relative",
            borderRadius: 20,
            overflow: "hidden",
            cursor: "zoom-in",
            background: "#F7F4EF",
            height: "100%",
          }}
        >
          <Image
            src={photos[idx]}
            alt={`Photo ${idx + 1}`}
            fill
            sizes="(max-width: 1200px) 70vw, 900px"
            priority={idx === 0}
            style={{ objectFit: "contain" }}
          />
          <span style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(17,17,17,0.72)", color: "white",
            fontSize: 11, fontWeight: 700, padding: "4px 10px",
            borderRadius: 999, pointerEvents: "none",
          }}>
            {idx + 1} / {photos.length} · Cliquez pour agrandir
          </span>
        </div>
      </div>
      {lightbox}
    </>
  )
}
