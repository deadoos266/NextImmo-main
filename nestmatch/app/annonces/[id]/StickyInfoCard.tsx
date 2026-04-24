"use client"
import { useEffect, useRef, useState } from "react"
import { useHeroPassed } from "./useHeroPassed"

/**
 * StickyInfoCard — R10.14 (bulletproof rewrite)
 *
 * Sticky JS ultra-simple (approche demandée par user R10.14) :
 *   1. Au mount : capture `offsetTop` du wrapper (position document-relative)
 *      + largeur + position left via getBoundingClientRect.
 *   2. Scroll listener : si `scrollY + NAV_OFFSET > offsetTop` → pin.
 *   3. Quand pinned : card en `position: fixed top:80 left:X width:W`,
 *      z-index 9998 (sous banner 9999 mais au-dessus de Leaflet).
 *   4. Wrapper reçoit `minHeight = cardHeight` pour zéro saut visuel.
 *
 * Clamp maxHeight quand bandeau visible via useHeroPassed : évite l'overlap
 * avec la zone banner (80 px + 16 px gap).
 *
 * Skip sous 900 px : la sidebar stack sous le contenu principal.
 *
 * Debug : window.__R_STICKY_DEBUG__ = true dans la console pour voir le
 * pinned state + thresholds.
 */

const NAV_OFFSET = 80
const BANNER_CLEARANCE = 96 // 80 banner + 16 gap

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)
  const [metrics, setMetrics] = useState<{ left: number; width: number; height: number } | null>(null)
  const bannerVisible = useHeroPassed()

  useEffect(() => {
    if (typeof window === "undefined") return

    let pinThreshold = 0

    const measure = () => {
      const wrapper = wrapperRef.current
      const card = cardRef.current
      if (!wrapper || !card) return
      const rect = wrapper.getBoundingClientRect()
      pinThreshold = rect.top + window.scrollY
      setMetrics({
        left: rect.left,
        width: rect.width,
        height: card.offsetHeight,
      })
    }

    const onScroll = () => {
      if (window.innerWidth < 900) {
        setPinned(false)
        return
      }
      if (pinThreshold === 0) measure()
      const shouldPin = window.scrollY + NAV_OFFSET > pinThreshold
      setPinned(shouldPin)
      if ((window as unknown as { __R_STICKY_DEBUG__?: boolean }).__R_STICKY_DEBUG__) {
        // eslint-disable-next-line no-console
        console.log("[StickyInfoCard]", { pinned: shouldPin, scrollY: window.scrollY, pinThreshold })
      }
    }

    const onResize = () => {
      measure()
      onScroll()
    }

    measure()
    onScroll()

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  const maxHeight = bannerVisible
    ? `calc(100vh - ${NAV_OFFSET + BANNER_CLEARANCE}px)`
    : `calc(100vh - ${NAV_OFFSET + 30}px)`

  return (
    <div
      ref={wrapperRef}
      style={{
        minHeight: pinned && metrics ? metrics.height : undefined,
      }}
    >
      <div
        ref={cardRef}
        id="r-sticky-card-target"
        style={pinned && metrics ? {
          position: "fixed",
          top: NAV_OFFSET,
          left: metrics.left,
          width: metrics.width,
          maxHeight,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          zIndex: 9998,
          transition: "max-height 200ms ease",
        } : undefined}
      >
        {children}
      </div>
    </div>
  )
}
