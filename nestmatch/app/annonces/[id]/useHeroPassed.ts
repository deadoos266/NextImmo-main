"use client"
import { useEffect, useState } from "react"

/**
 * useHeroPassed
 *
 * Indique quand le user a scrollé au-delà du bas du hero image
 * (PhotoCarousel). Trigger pour le StickyCTABanner — depuis la
 * suppression de la sticky info card (R12), c'est l'unique consommateur
 * du hook, mais il reste isolé ici pour pouvoir resservir si on
 * réintroduit une sticky TOC plus tard.
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
