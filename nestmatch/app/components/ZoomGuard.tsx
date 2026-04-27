"use client"

import { useEffect } from "react"

/**
 * ZoomGuard — defense en profondeur contre le pinch-zoom out qui casse le
 * scroll mobile (Paul 2026-04-27).
 *
 * Bug : sur iOS Safari, meme avec viewport meta `maximumScale: 1`, certains
 * users arrivent a dezoom < 100% (rotation device, changement orientation,
 * gestes multi-touch). Resultat : le contenu devient plus petit que le
 * viewport, le scroll est cassé.
 *
 * Fix multi-couches :
 * 1. Viewport meta (app/layout.tsx) : minimumScale 1 + maximumScale 1.
 * 2. CSS touch-action: pan-y (app/globals.css) sur html/body.
 * 3. JS guard (ce composant) : visualViewport.scale watcher → si < 1,
 *    on force un reset du document height et un re-scroll a la position
 *    courante. Pour les rares cas qui passent les 2 garde precedents.
 *
 * Mounted une fois dans app/layout.tsx (cote client). No-op SSR.
 */
export default function ZoomGuard() {
  useEffect(() => {
    const vv = (window as Window & { visualViewport?: VisualViewport }).visualViewport
    if (!vv) return

    function handleResize() {
      if (!vv) return
      // Si le scale chute sous 1, c'est un dezoom out. iOS le permet
      // parfois meme avec maximumScale 1. On reset le document overflow
      // pour garantir scroll possible.
      if (vv.scale < 0.99) {
        // Force le reflow + reset overflow body
        document.body.style.overflow = "auto"
        document.documentElement.style.overflow = "auto"
        // Trigger un layout pass via scrollTo (no-op si deja a 0)
        window.scrollTo({ top: window.scrollY, behavior: "auto" })
      }
    }

    vv.addEventListener("resize", handleResize)
    vv.addEventListener("scroll", handleResize)
    return () => {
      vv.removeEventListener("resize", handleResize)
      vv.removeEventListener("scroll", handleResize)
    }
  }, [])

  return null
}
