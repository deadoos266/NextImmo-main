"use client"
import { useEffect, useState } from "react"
import { useHeroPassed } from "./useHeroPassed"

/**
 * StickyInfoCard — R10.15 (widget fixed-always)
 *
 * Plus de scroll listener, plus de calcul de seuil, plus de containing-block
 * warfare. Sur desktop (≥1024 px), la card est `position: fixed top:80 right:X`
 * dès le premier render, comme un widget Intercom. Sur mobile (<1024 px),
 * elle retombe en flow normal (position: relative) — la sidebar stacke sous
 * le contenu principal via la media query de page.tsx.
 *
 * Placeholder horizontal : la colonne droite du grid garde `width: 360` →
 * le contenu de la colonne gauche n'empiète pas sur la zone du widget.
 *
 * Max-height clamp : quand le StickyCTABanner est visible (via useHeroPassed),
 * on raccourcit de 96 px (80 banner + 16 gap) pour éviter l'overlap avec la
 * zone fixed du bas.
 *
 * z-index 9998 : sous le banner (9999) mais au-dessus de tout le reste, y
 * compris les panes Leaflet (≤ 700).
 *
 * Sécurité SSR : on assume desktop par défaut pour matcher le rendu serveur,
 * puis on hydrate vers la vraie valeur mobile/desktop via matchMedia.
 */

const NAV_OFFSET = 80
const CARD_WIDTH = 360
const BANNER_CLEARANCE = 96 // 80 banner + 16 gap

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState<boolean>(true)
  const bannerVisible = useHeroPassed()

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  const maxHeight = bannerVisible
    ? `calc(100vh - ${NAV_OFFSET + BANNER_CLEARANCE}px)`
    : `calc(100vh - ${NAV_OFFSET + 30}px)`

  if (!isDesktop) {
    // Mobile / tablette : pas de fixed, flow normal. Le parent .r-detail-sidebar
    // stacke déjà sous le contenu principal via media query < 1024.
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
        maxHeight,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        zIndex: 9998,
        transition: "max-height 200ms ease",
      }}
    >
      {children}
    </aside>
  )
}
