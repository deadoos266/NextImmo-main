"use client"
import { useState, useEffect } from "react"

/**
 * Hook de responsive — retourne toujours desktop (width=1200) AVANT mount
 * pour garantir SSR === premier render client. Après mount, lit vraiment
 * `window.innerWidth` et re-render si besoin.
 *
 * `mounted` est exposé pour permettre aux consommateurs qui rendent des
 * structures DOM radicalement différentes entre mobile/desktop de gate
 * le render (éviter un flash desktop → mobile sur un user mobile).
 */
export function useResponsive() {
  const [width, setWidth] = useState(1200)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setWidth(window.innerWidth)
    setMounted(true)
    function onResize() { setWidth(window.innerWidth) }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return {
    isMobile: width < 640,
    isTablet: width >= 640 && width < 1024,
    isDesktop: width >= 1024,
    mounted,
  }
}
