"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * StickyInfoCard — R10.22 (portal + fixed + transform-compensation)
 *
 * Abandon définitif de toute logique responsive côté composant.
 * L'aside est TOUJOURS portal'd hors <body> (vers documentElement), TOUJOURS
 * positionnée en position:fixed ET renforcée par un scroll-listener JS qui
 * mesure la dérive et la compense par `transform: translateY(-drift)`.
 *
 * Pourquoi transform et pas re-positionnement absolute ?
 *
 *   L'ancienne R10.21 basculait en `position: absolute; top: scrollY + 80`
 *   quand elle détectait une dérive. Bug : selon le Initial Containing Block
 *   (ICB) du navigateur, cette stratégie peut faire BOUGER l'élément AVEC le
 *   scroll au lieu de le compenser — symptôme observé : ça tient 0.5s puis
 *   ça se met à scroller. Les transforms CSS sont mathématiquement non
 *   ambigus (pixels absolus, zéro ICB) donc la compensation marche toujours.
 *
 * Impossible à casser :
 *   - Si un ancêtre a filter/transform qui remonte jusqu'au portal → le
 *     translateY rattrape la dérive au prochain frame
 *   - Si le CSS fixed marche → drift=0, transform reste vide, aucun coût
 *   - Si le viewport est petit → la card se réduit à min(360px, 92vw) au
 *     lieu de disparaître
 *
 * Le seul cas où on revient au fallback flow = SSR (pas de DOM côté serveur).
 */

const NAV_OFFSET = 80
const MAX_CARD_WIDTH = 360
const PORTAL_TARGET_ID = "nm-fixed-portal-root"
const VERSION = "R10.22"

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
  //
  // R10.22 — FIX CRITIQUE : l'ancienne version R10.21 basculait en
  // `position: absolute; top: scrollY + 80` quand elle détectait une dérive.
  // MAIS : selon le Initial Containing Block (ICB) du navigateur, cette
  // stratégie peut faire BOUGER l'élément AVEC le scroll au lieu de le
  // compenser (symptôme exact rapporté : ça tient 0.5s puis ça scrolle).
  //
  // Nouvelle stratégie : on GARDE toujours position:fixed + top:80 et on
  // compense la dérive par `transform: translateY(-drift)`. Les transforms
  // sont mathématiquement non ambigus : -drift pixels, point. Aucun ICB,
  // aucun anchor container. Si le parent a filter/transform qui casse le
  // fixed, le translateY rattrape la différence frame par frame.
  useEffect(() => {
    if (!portalTarget) return
    let raf: number | null = null

    function apply() {
      raf = null
      const el = asideRef.current
      if (!el) return
      // Étape 1 : appliquer position:fixed + top:80 + reset transform.
      // On reset le transform AVANT de mesurer sinon on mesure un rect
      // déjà compensé et la dérive calculée serait nulle à tort.
      el.style.position = "fixed"
      el.style.top = `${NAV_OFFSET}px`
      el.style.right = `${computeRightOffset()}px`
      el.style.width = `${computeCardWidth()}px`
      el.style.transform = ""
      // Étape 2 : mesurer la position réelle. Si fixed marche, rect.top === 80.
      // Sinon (parent a filter/transform), rect.top dérive.
      const rect = el.getBoundingClientRect()
      const drift = rect.top - NAV_OFFSET
      // Étape 3 : compenser la dérive avec translateY. Mathématiquement
      // non ambigu : -drift pixels. Zéro dépendance à l'ICB.
      if (Math.abs(drift) > 1) {
        el.style.transform = `translateY(${-drift}px)`
      }
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
