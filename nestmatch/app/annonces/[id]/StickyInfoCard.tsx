"use client"
import { useEffect, useState } from "react"

/**
 * StickyInfoCard — R10.16 (nucléaire simple)
 *
 * Widget fixed qui contient UNIQUEMENT la booking card (prix + score + CTAs
 * + proprio). Pas d'overflow, pas de maxHeight, hauteur = hauteur naturelle
 * du contenu. Zéro scroll nested.
 *
 * Desktop (≥1024 px) : `position: fixed top:80 right:gutter width:360`,
 * z-index 9998 (sous banner 9999, au-dessus de Leaflet).
 *
 * Mobile (<1024 px) : retombe en flow normal, la sidebar stacke sous le
 * contenu principal via la media query de page.tsx.
 *
 * Toutes les autres cards (LocataireMatchCard, Activité, Budget, Autres biens,
 * Partager) ont été re-ventilées dans le flow principal de la colonne
 * gauche ou en bas de page — plus de scroll dans le scroll.
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
      <div id="r-sticky-card-target" style={{ width: "100%" }}>
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
        right: `max(48px, calc((100vw - 1280px) / 2 + 48px))`,
        width: CARD_WIDTH,
        zIndex: 9998,
      }}
    >
      {children}
    </aside>
  )
}
