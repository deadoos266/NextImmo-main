"use client"
import { useEffect, useState } from "react"

/**
 * useHeroPassed — R10.13
 *
 * Hook partagé : indique quand le user a scrollé au-delà du bas du hero image
 * (PhotoCarousel). Sert de trigger commun pour :
 *   - StickyCTABanner (affichage du bandeau bas)
 *   - StickyInfoCard (clamp du maxHeight pour ne pas chevaucher le bandeau)
 *
 * Cible DOM : élément avec l'id passé en arg (défaut "#r-hero-photo"). Si
 * introuvable (page pas encore hydratée), fallback scroll threshold 600 px.
 *
 * rAF-throttled, listener passif. Retourne false tant que le user n'a pas
 * dépassé la zone hero + 80 px (offset navbar).
 */
export function useHeroPassed(selector: string = "#r-hero-photo"): boolean {
  const [passed, setPassed] = useState(false)

  useEffect(() => {
    let raf: number | null = null

    function check() {
      raf = null
      const el = document.querySelector(selector)
      if (!el) {
        setPassed(window.scrollY > 600)
        return
      }
      const rect = el.getBoundingClientRect()
      setPassed(rect.bottom < 80)
    }

    function onScroll() {
      if (raf !== null) return
      raf = requestAnimationFrame(check)
    }

    check()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [selector])

  return passed
}
