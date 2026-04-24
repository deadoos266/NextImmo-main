"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * StickyInfoCard — R10.20 (JS-driven, bulletproof)
 *
 * Après plusieurs tentatives CSS cassées par le filter dark-mode sur <body>,
 * on passe à une approche JS pure : la position de l'aside est calculée et
 * appliquée en JavaScript à chaque scroll. Aucun risque de containing block
 * puisqu'on ne dépend plus de `position: fixed` pour rester au viewport.
 *
 * STRATÉGIE
 * ---------
 * 1. React Portal vers un <div> enfant direct de <html> (hors <body>).
 *    → Aucun ancêtre filtrant entre l'aside et le viewport.
 * 2. Aside en `position: absolute` (pas fixed), initial containing block
 *    = viewport (parent du portal target n'a aucune style positionnelle).
 * 3. Scroll listener rAF-throttled qui update `style.top = scrollY + 80px`.
 *    → L'aside suit le scroll manuellement, reste visuellement ancrée
 *       à 80 px du haut du viewport en permanence.
 * 4. Resize listener pour recalculer la gutter `right`.
 *
 * GUARDS
 * ------
 * - Breakpoint 1024 px : en-dessous, fallback flow normal (sidebar stacke
 *   naturellement sous le contenu principal via la media query de page.tsx).
 * - SSR : avant mount, même fallback flow normal — pas de hydration mismatch.
 * - Dark mode : filter d'inversion ré-appliqué à l'aside (perdu en sortant
 *   de <body>).
 *
 * DIAGNOSTICS
 * -----------
 * `data-nm-sticky-version="R10.20"` + `data-nm-sticky-mode="{flow|portal}"`
 * sur l'élément — permet de vérifier de l'extérieur (DevTools, script
 * utilisateur) quelle branche est active sans mot de passe de debug.
 */

const NAV_OFFSET = 80
const CARD_WIDTH = 360
const BREAKPOINT = 1024
const PORTAL_TARGET_ID = "nm-fixed-portal-root"
const VERSION = "R10.20"

function getOrCreatePortalTarget(): HTMLElement {
  let el = document.getElementById(PORTAL_TARGET_ID)
  if (!el) {
    el = document.createElement("div")
    el.id = PORTAL_TARGET_ID
    document.documentElement.appendChild(el)
  }
  return el
}

function computeRightOffset(): number {
  // Même logique que `max(24px, calc((100vw - 1280px) / 2 + 24px))`
  // en JS pour contrôler la position au pixel près.
  if (typeof window === "undefined") return 24
  return Math.max(24, Math.floor((window.innerWidth - 1280) / 2 + 24))
}

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [isDesktop, setIsDesktop] = useState<boolean>(true)
  const [isDark, setIsDark] = useState<boolean>(false)
  const asideRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setPortalTarget(getOrCreatePortalTarget())

    const mql = window.matchMedia(`(min-width: ${BREAKPOINT}px)`)
    const updateDesktop = () => setIsDesktop(mql.matches)
    updateDesktop()
    mql.addEventListener("change", updateDesktop)

    const checkDark = () => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark")
    }
    checkDark()
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

    return () => {
      mql.removeEventListener("change", updateDesktop)
      observer.disconnect()
    }
  }, [])

  // Scroll + resize listener : met à jour top/right du aside
  // rAF-throttled pour rester smooth.
  useEffect(() => {
    if (!portalTarget || !isDesktop) return
    let raf: number | null = null

    function apply() {
      raf = null
      const el = asideRef.current
      if (!el) return
      el.style.top = `${window.scrollY + NAV_OFFSET}px`
      el.style.right = `${computeRightOffset()}px`
    }

    function schedule() {
      if (raf !== null) return
      raf = requestAnimationFrame(apply)
    }

    apply() // position initiale
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [portalTarget, isDesktop])

  // Fallback pre-mount / mobile : flow normal stacké.
  if (!portalTarget || !isDesktop) {
    return (
      <div
        id="r-sticky-card-target"
        data-nm-sticky-version={VERSION}
        data-nm-sticky-mode="flow"
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}
      >
        {children}
      </div>
    )
  }

  const aside = (
    <aside
      ref={asideRef}
      id="r-sticky-card-target"
      data-nm-sticky-version={VERSION}
      data-nm-sticky-mode="portal"
      aria-label="Informations et actions du logement"
      style={{
        position: "absolute", // top/right sont driven par le scroll listener
        top: NAV_OFFSET,
        right: computeRightOffset(),
        width: CARD_WIDTH,
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "#111",
        filter: isDark ? "invert(0.92) hue-rotate(180deg)" : undefined,
      }}
    >
      {children}
    </aside>
  )

  return createPortal(aside, portalTarget)
}
