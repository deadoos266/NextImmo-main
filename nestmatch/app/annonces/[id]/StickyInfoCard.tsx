"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * StickyInfoCard — R10.21 (NUKE : toujours fixée, peu importe le viewport)
 *
 * Abandon définitif de toute logique responsive côté composant.
 * L'aside est TOUJOURS portal'd hors <body>, TOUJOURS positionnée en
 * position:fixed ET renforcée par un scroll-listener JS qui force
 * `style.top = 80px` à chaque frame. Impossible à casser :
 *
 *   - Si un ancêtre a filter/transform → on est déjà hors <body> via portal
 *   - Si le CSS fixed foirait quand même → le JS rattrape au frame suivant
 *   - Si le viewport est petit → la card se réduit à min(360px, 92vw) au
 *     lieu de disparaître
 *
 * Le seul cas où on revient au fallback flow = SSR (pas de DOM côté serveur).
 *
 * La card reste donc toujours visible, toujours à 80 px du haut du viewport,
 * toujours alignée à droite. L'utilisateur voit ses cards sans jamais
 * qu'elles descendent au scroll.
 */

const NAV_OFFSET = 80
const MAX_CARD_WIDTH = 360
const PORTAL_TARGET_ID = "nm-fixed-portal-root"
const VERSION = "R10.21"

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
  if (typeof window === "undefined") return 24
  // Sur viewport ≥1280 : aligne sur container 1280 avec gutter 24. Sinon
  // colle à 12 px du bord droit.
  if (window.innerWidth >= 1280) {
    return Math.floor((window.innerWidth - 1280) / 2 + 24)
  }
  return 12
}

function computeCardWidth(): number {
  if (typeof window === "undefined") return MAX_CARD_WIDTH
  return Math.min(MAX_CARD_WIDTH, Math.floor(window.innerWidth * 0.92))
}

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [isDark, setIsDark] = useState<boolean>(false)
  const asideRef = useRef<HTMLElement | null>(null)

  // Init portal target + dark-mode observer
  useEffect(() => {
    setPortalTarget(getOrCreatePortalTarget())

    const checkDark = () => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark")
    }
    checkDark()
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [])

  // Scroll + resize listener — renforce la position même si position:fixed
  // CSS était mystérieusement cassé. rAF-throttled, passive.
  useEffect(() => {
    if (!portalTarget) return
    let raf: number | null = null

    function apply() {
      raf = null
      const el = asideRef.current
      if (!el) return
      // On met BOTH position:fixed (naturel via CSS) ET un top absolu.
      // Si fixed marche, top:80 reste à 80 au viewport.
      // Si fixed était cassé (body contenant block à cause d'un filter),
      // on force position:absolute + top:scrollY+80 pour compenser.
      // Détection : on mesure le rect ; si top dérive du 80 attendu au
      // scroll, on bascule en mode absolute-compensated.
      const rect = el.getBoundingClientRect()
      const drift = Math.abs(rect.top - NAV_OFFSET)
      if (drift > 2) {
        // position:fixed est cassée. Bascule absolute-compensated.
        el.style.position = "absolute"
        el.style.top = `${window.scrollY + NAV_OFFSET}px`
      } else {
        el.style.position = "fixed"
        el.style.top = `${NAV_OFFSET}px`
      }
      el.style.right = `${computeRightOffset()}px`
      el.style.width = `${computeCardWidth()}px`
    }

    function schedule() {
      if (raf !== null) return
      raf = requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [portalTarget])

  // SSR / pré-mount : flow normal le temps que le client boote.
  if (!portalTarget) {
    return (
      <div
        id="r-sticky-card-target"
        data-nm-sticky-version={VERSION}
        data-nm-sticky-mode="flow-ssr"
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
        position: "fixed",
        top: NAV_OFFSET,
        right: computeRightOffset(),
        width: computeCardWidth(),
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "#111",
        // Dark mode : ré-applique l'inversion perdue en sortant de <body>.
        filter: isDark ? "invert(0.92) hue-rotate(180deg)" : undefined,
        // Pas de maxHeight / overflow (règle user : pas de scroll dans le
        // scroll). Si les cards dépassent le viewport, cutoff bas assumé.
      }}
    >
      {children}
    </aside>
  )

  return createPortal(aside, portalTarget)
}
