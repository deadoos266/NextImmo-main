"use client"
import { useEffect, useState } from "react"

/**
 * StickyInfoCard — R10.17 (toutes les infos fixées ensemble)
 *
 * La colonne droite ENTIÈRE est fixée en haut et ne bouge jamais au scroll.
 * Contient toutes les cards empilées en flex-column (booking, profil
 * recherché, activité, budget, partager).
 *
 * Zéro overflow, zéro maxHeight, hauteur auto. Si le contenu dépasse le
 * viewport en bas, tant pis — choix assumé (pas de scroll dans le scroll).
 *
 * Desktop (≥1024 px) : `position: fixed top:80 right:gutter width:360`,
 * z-index 9998 (sous banner 9999, au-dessus de Leaflet ≤700).
 *
 * Mobile (<1024 px) : flow normal, la sidebar stacke sous le contenu
 * principal via la media query de page.tsx.
 */

const NAV_OFFSET = 80
const CARD_WIDTH = 360

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState<boolean>(true)

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  if (!isDesktop) {
    return (
      <div
        id="r-sticky-card-target"
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}
      >
        {children}
      </div>
    )
  }

  return (
    <aside
      id="r-sticky-card-target"
      aria-label="Informations et actions du logement"
      style={{
        position: "fixed",
        top: NAV_OFFSET,
        right: `max(24px, calc((100vw - 1280px) / 2 + 24px))`,
        width: CARD_WIDTH,
        height: "auto",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {children}
    </aside>
  )
}
