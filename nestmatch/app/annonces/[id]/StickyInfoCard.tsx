"use client"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * StickyInfoCard — R10.24 (clean, sans debug)
 *
 * Le debug overlay R10.23 a confirmé que la card reste bien à rect.top=80
 * même après scrollY=222 (frame=11422, drift=0, transform=none). Le bug de
 * "ça bouge quand je scroll" était en fait :
 *
 *   1. Un flicker au moment du swap SSR→portal (~0.5s après le boot) — la
 *      card apparaissait dans le flow normal puis sautait en position fixed.
 *      Corrigé ici en rendant directement en `position: fixed` côté SSR.
 *
 *   2. La perception du scroll du contenu derrière la card fixed peut donner
 *      l'illusion d'un mouvement de la card. C'est en réalité le contenu de
 *      la page qui défile sous la card, pas la card qui bouge.
 *
 * Architecture :
 *   - Portal vers documentElement (sortir du body sur lequel le dark mode
 *     applique un filter qui crée un containing block)
 *   - rAF loop défensif qui ré-applique position/top/right/width chaque
 *     frame ET compense toute dérive éventuelle via transform: translateY
 *     (mathématiquement non-ambigu)
 *
 * Coût : ~0.1 ms par frame, imperceptible.
 */

const NAV_OFFSET = 80
const MAX_CARD_WIDTH = 360
const PORTAL_TARGET_ID = "nm-fixed-portal-root"
const VERSION = "R10.24"

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

  // Init portal target + dark-mode observer (one-shot)
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

  // rAF loop défensif : force position/top/right/width chaque frame et
  // compense toute dérive via transform (au cas où un containing block
  // dynamique apparaîtrait après mount).
  useEffect(() => {
    let frameId = 0
    let lastTransform = ""

    function tick() {
      const el = asideRef.current
      if (el) {
        if (el.style.position !== "fixed") el.style.position = "fixed"
        const wantedTop = `${NAV_OFFSET}px`
        if (el.style.top !== wantedTop) el.style.top = wantedTop
        const wantedRight = `${computeRightOffset()}px`
        if (el.style.right !== wantedRight) el.style.right = wantedRight
        const wantedWidth = `${computeCardWidth()}px`
        if (el.style.width !== wantedWidth) el.style.width = wantedWidth
        if (el.style.zIndex !== "9998") el.style.zIndex = "9998"

        // Reset transform pour mesurer la position naturelle
        if (lastTransform) el.style.transform = ""

        const rect = el.getBoundingClientRect()
        const drift = Math.round(rect.top - NAV_OFFSET)

        const newTransform = drift !== 0 ? `translateY(${-drift}px)` : ""
        if (newTransform !== lastTransform) {
          el.style.transform = newTransform
          lastTransform = newTransform
        }
      }
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [])

  // Rendu unifié : SSR ET client rendent en position: fixed, top: 80.
  // Tant que portalTarget n'est pas prêt (premier render client), on rend
  // l'aside in-place dans le flow parent — mais en `position: fixed` aussi,
  // donc visuellement identique à la version portal. Pas de flicker au swap.
  const aside = (
    <aside
      ref={asideRef}
      id="r-sticky-card-target"
      data-nm-sticky-version={VERSION}
      data-nm-sticky-mode={portalTarget ? "portal" : "pre-portal"}
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
        filter: isDark && portalTarget ? "invert(0.92) hue-rotate(180deg)" : undefined,
      }}
    >
      {children}
    </aside>
  )

  if (!portalTarget) return aside
  return createPortal(aside, portalTarget)
}
