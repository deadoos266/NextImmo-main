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
 *  - Desktop/tablet + ≥3 photos : mosaïque hero handoff Claude Design (3)
 *    `app.jsx` DetailScreen l. 1387-1403 — grande photo gauche 2fr (avec
 *    dots blancs bas-gauche pour cycler) + 2 photos empilées droite 1fr,
 *    height 480, gap 12, borderRadius 20. Clic n'importe où → lightbox.
 *  - Desktop/tablet + <3 photos : fallback layout mobile (carousel simple).
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
  // false. Après mount, on bascule sur la mosaïque si desktop + ≥3 photos.
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

  // ─── Desktop/tablet + ≥3 photos : mosaïque handoff 2fr/1fr ─────────
  // Pattern handoff Claude Design (3) `app.jsx` l. 1387-1403 :
  //   - Photo principale gauche 2fr — carrousel via dots blancs bas-gauche
  //     (cycle photos[idx] avec opacity transition 600ms, signature visuelle
  //     éditoriale).
  //   - 2 photos secondaires droite empilées 1fr/1fr (photos[1] et photos[2])
  //     visibles à plat, fixes — la mosaïque montre 3 photos d'un coup.
  //   - Clic n'importe où → lightbox à l'index correspondant.
  //   - Compteur "+N" sur la 2e vignette si > 3 photos pour signaler le
  //     reste accessible via lightbox.
  const remaining = Math.max(0, photos.length - 3)
  return (
    <>
      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 12,
        width: "100%",
        height: 480,
        marginBottom: 20,
      }}>
        {/* Photo principale gauche — carrousel via dots */}
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
          {photos.map((p, i) => (
            <Image
              key={p + i}
              src={p}
              alt={`Photo ${i + 1}`}
              fill
              sizes="(max-width: 1200px) 60vw, 720px"
              priority={i === 0}
              style={{
                objectFit: "cover",
                opacity: i === idx ? 1 : 0,
                transition: "opacity 600ms",
              }}
            />
          ))}

          {/* Dots blancs bas-gauche — l'actif s'allonge en barre 26×8 */}
          <div style={{ position: "absolute", bottom: 20, left: 20, display: "flex", gap: 6 }}>
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Photo ${i + 1}`}
                aria-pressed={i === idx}
                onClick={e => { e.stopPropagation(); setIdx(i) }}
                style={{
                  width: i === idx ? 26 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.5)",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 300ms",
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Indicateur cliquable haut-droit — discret, signal de zoom */}
          <span style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(17,17,17,0.55)", color: "white",
            fontSize: 11, fontWeight: 700, padding: "4px 10px",
            borderRadius: 999, pointerEvents: "none",
          }}>
            Cliquez pour agrandir
          </span>
        </div>

        {/* 2 photos secondaires empilées droite */}
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 12 }}>
          <div
            onClick={() => openLightboxAt(1)}
            style={{
              position: "relative",
              borderRadius: 20,
              overflow: "hidden",
              cursor: "zoom-in",
              background: "#F7F4EF",
            }}
          >
            <Image src={photos[1]} alt="Photo 2" fill sizes="(max-width: 1200px) 30vw, 360px" style={{ objectFit: "cover" }} />
          </div>
          <div
            onClick={() => openLightboxAt(2)}
            style={{
              position: "relative",
              borderRadius: 20,
              overflow: "hidden",
              cursor: "zoom-in",
              background: "#F7F4EF",
            }}
          >
            <Image src={photos[2]} alt="Photo 3" fill sizes="(max-width: 1200px) 30vw, 360px" style={{ objectFit: "cover" }} />
            {remaining > 0 && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(17,17,17,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px",
                pointerEvents: "none",
              }}>
                +{remaining}
              </div>
            )}
          </div>
        </div>
      </div>
      {lightbox}
    </>
  )
}
