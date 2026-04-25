"use client"
import { useEffect, useState } from "react"

/**
 * StickyInfoCard — R11.1 (zéro swap SSR→client)
 *
 * Différence avec R11 : SSR rend déjà l'aside en `position: fixed top:80`
 * avec des fallbacks safe (right: 24, width: 360). Pas de swap d'élément
 * (div→aside) à l'hydratation, donc pas de saut visuel.
 *
 * Le client met à jour right/width via useEffect après mount, mais ce sont
 * juste des property updates sur un élément déjà fixé — pas de jump.
 *
 * Mobile (<1024px) : un useEffect bascule `position: static` après mount
 * pour retomber en flow normal. Pendant SSR mobile on a un instant fixed
 * incorrect (négligeable, < 50ms).
 */

const NAV_OFFSET = 80
const MAX_CARD_WIDTH = 360
const SSR_RIGHT_FALLBACK = 24
const SSR_WIDTH_FALLBACK = 360
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
  const [vw, setVw] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setVw(window.innerWidth)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const isMobile = vw !== null && vw < MOBILE_BREAKPOINT

  // Mobile : flow normal après mount
  if (isMobile) {
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

  // Desktop + SSR : aside en position fixed direct
  // (vw=null pendant SSR → on utilise les fallbacks)
  const right = vw !== null ? computeRightOffset(vw) : SSR_RIGHT_FALLBACK
  const width = vw !== null ? computeCardWidth(vw) : SSR_WIDTH_FALLBACK

  return (
    <aside
      id="r-sticky-card-target"
      data-nm-sticky-mode="fixed"
      data-nm-sticky-version="R11.1"
      aria-label="Informations et actions du logement"
      style={{
        position: "fixed",
        top: NAV_OFFSET,
        right,
        width,
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
