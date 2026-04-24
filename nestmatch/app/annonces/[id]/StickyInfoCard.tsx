"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useHeroPassed } from "./useHeroPassed"

/**
 * StickyInfoCard — R10.13
 *
 * Sticky JS-based : `position: sticky` CSS refuse de sticker sur cette page
 * (cause exacte non identifiable statiquement — ancêtres paraissent clean).
 * On court-circuite avec `position: fixed` calculé au scroll.
 *
 * Principe :
 *   - Un wrapper-placeholder mesuré en permanence (garde sa place dans le flow)
 *   - Un enfant card qui bascule en `position: fixed` quand le placeholder
 *     passe sous NAVBAR_OFFSET (80 px). On aligne left/width sur le placeholder
 *     pour que la card reste dans la gouttière de la sidebar.
 *   - `minHeight` du placeholder = hauteur mesurée de la card → pas de saut
 *     visuel quand on bascule fixed.
 *
 * Clamp maxHeight : quand le StickyCTABanner est visible (même trigger
 * scroll via useHeroPassed), on raccourcit la card pour laisser le bandeau
 * respirer 80 px + 16 px de gap. Garantit zéro overlap entre les deux zones
 * fixed.
 *
 * Skip sous 1024 px : la sidebar stack sous le contenu principal, la card
 * reste en flow normal.
 *
 * Perf : rAF-throttled scroll + resize, listener passif. z-index 20, sous le
 * z-index 60 du banner — si overlap malgré le clamp, banner gagne visuellement.
 */

const NAVBAR_OFFSET = 80
const BANNER_HEIGHT = 80
const BANNER_GAP = 16

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [cardHeight, setCardHeight] = useState(0)
  const [fixedPos, setFixedPos] = useState<{ left: number; width: number } | null>(null)
  const bannerVisible = useHeroPassed()

  const update = useCallback(() => {
    const wrapper = wrapperRef.current
    const card = cardRef.current
    if (!wrapper || !card) return

    if (window.innerWidth < 1024) {
      setFixedPos(null)
      return
    }

    const rect = wrapper.getBoundingClientRect()
    const h = card.offsetHeight
    if (h && h !== cardHeight) setCardHeight(h)

    if (rect.top <= NAVBAR_OFFSET) {
      setFixedPos({ left: rect.left, width: rect.width })
    } else {
      setFixedPos(null)
    }
  }, [cardHeight])

  useEffect(() => {
    function onScrollOrResize() {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        update()
      })
    }
    update()
    window.addEventListener("scroll", onScrollOrResize, { passive: true })
    window.addEventListener("resize", onScrollOrResize)
    return () => {
      window.removeEventListener("scroll", onScrollOrResize)
      window.removeEventListener("resize", onScrollOrResize)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [update])

  const isFixed = fixedPos !== null
  const maxHeight = bannerVisible
    ? `calc(100vh - ${NAVBAR_OFFSET + BANNER_HEIGHT + BANNER_GAP}px)`
    : `calc(100vh - ${NAVBAR_OFFSET + 30}px)`

  return (
    <div
      ref={wrapperRef}
      style={{
        width: "100%",
        minHeight: isFixed && cardHeight ? cardHeight : undefined,
      }}
    >
      <div
        ref={cardRef}
        id="r-sticky-card-target"
        style={isFixed ? {
          position: "fixed",
          top: NAVBAR_OFFSET,
          left: fixedPos!.left,
          width: fixedPos!.width,
          maxHeight,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          zIndex: 20,
          transition: "max-height 200ms ease",
        } : undefined}
      >
        {children}
      </div>
    </div>
  )
}
