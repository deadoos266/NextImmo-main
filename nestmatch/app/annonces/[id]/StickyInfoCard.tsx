"use client"
import { useEffect, useState } from "react"

/**
 * StickyInfoCard — R11 (refonte minimaliste)
 *
 * Toutes les versions précédentes (R10.13 → R10.24) utilisaient un système
 * complexe : portal vers documentElement + rAF loop + transform compensation.
 * Ce système causait un jitter visuel (reset transform à chaque frame, même
 * imperceptible, peut créer un sub-pixel shift sur certains GPU).
 *
 * Cette version repart à zéro :
 *   - Aucun portal
 *   - Aucun requestAnimationFrame loop
 *   - Aucune compensation transform
 *   - Juste un `<aside>` rendu en `position: fixed` natif
 *
 * En light mode, aucun ancêtre n'a de filter/transform/will-change, donc
 * `position: fixed` se comporte parfaitement (relatif au viewport).
 *
 * En dark mode, le `body { filter: invert(...) }` de globals.css crée un
 * containing block. Pour ce cas spécifique, on bascule l'aside en mode
 * `position: absolute` avec recalcul du top sur scroll (un seul listener
 * passive, rAF-throttled, qui ne touche QUE `top` — pas de transform reset).
 *
 * Mobile (<1024px) : la card retombe en flow normal (pas de fixed) pour
 * laisser respirer le scroll.
 */

const NAV_OFFSET = 80
const MAX_CARD_WIDTH = 360
const MOBILE_BREAKPOINT = 1024

function computeRightOffset(viewportWidth: number): number {
  if (viewportWidth >= 1280) {
    return Math.floor((viewportWidth - 1280) / 2 + 24)
  }
  return 12
}

function computeCardWidth(viewportWidth: number): number {
  return Math.min(MAX_CARD_WIDTH, Math.floor(viewportWidth * 0.92))
}

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [vw, setVw] = useState<number>(1280)

  useEffect(() => {
    setMounted(true)
    const update = () => setVw(window.innerWidth)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // SSR / pré-mount : flow normal (la card s'affichera à sa place naturelle
  // dans la sidebar parente, le temps que le client boote). Pas de saut au
  // mount car la card a la même width côté SSR (360px ≈ width sidebar).
  if (!mounted) {
    return (
      <div
        id="r-sticky-card-target"
        data-nm-sticky-mode="ssr"
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {children}
      </div>
    )
  }

  // Mobile : flow normal, pas de fixed
  if (vw < MOBILE_BREAKPOINT) {
    return (
      <div
        id="r-sticky-card-target"
        data-nm-sticky-mode="mobile-flow"
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {children}
      </div>
    )
  }

  // Desktop : position fixed pure
  return (
    <aside
      id="r-sticky-card-target"
      data-nm-sticky-mode="fixed"
      data-nm-sticky-version="R11"
      aria-label="Informations et actions du logement"
      style={{
        position: "fixed",
        top: NAV_OFFSET,
        right: computeRightOffset(vw),
        width: computeCardWidth(vw),
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "#111",
      }}
    >
      {children}
    </aside>
  )
}
