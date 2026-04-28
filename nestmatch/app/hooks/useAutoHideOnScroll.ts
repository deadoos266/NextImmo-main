"use client"

import { useEffect, useRef, useState } from "react"

/**
 * V5.2 (Paul 2026-04-28) — hook reutilisable pour cacher un bandeau sticky
 * au scroll-down, le revealer au scroll-up. Comportement Twitter/Mail iOS.
 *
 * Initialement extrait de BetaBanner (V4.6). Maintenant utilise par :
 * - BetaBanner (top sticky)
 * - StickyCTABanner (bottom sticky /annonces/[id])
 * - tout futur bandeau sticky
 *
 * Defaut : actif uniquement sur mobile (< 768px). Sur desktop, hidden
 * reste toujours false (bandeaux fixes pour preserver la lisibilite du
 * contexte).
 *
 * Usage :
 *   const hidden = useAutoHideOnScroll()
 *   <div style={{ transform: hidden ? "translateY(-110%)" : "translateY(0)", transition: "transform 220ms ease" }}>
 *
 * Pour les bandeaux bottom-sticky, l'utilisateur passe direction="bottom" :
 *   const hidden = useAutoHideOnScroll({ direction: "bottom" })
 *   → translate +110% au lieu de -110%.
 */
export interface AutoHideOptions {
  /**
   * Active le hook uniquement quand un media query est match. Default :
   * `(max-width: 767px)` (mobile only).
   */
  mediaQuery?: string
  /**
   * Threshold en px pour activer le hide (eviter les jitters au scroll
   * leger). Default 4px.
   */
  threshold?: number
  /**
   * ScrollY minimum avant de hider (eviter de hider quand on est tout en
   * haut). Default 30px.
   */
  minScrollY?: number
  /**
   * Si true, le hook reste \"actif\" tout le temps (desktop inclus). Default
   * false (mobile-only via mediaQuery).
   */
  alwaysActive?: boolean
  /**
   * Si false, force `hidden` a toujours rester false meme quand le hook
   * est actif. Permet de desactiver le auto-hide localement (ex. quand un
   * modal est ouvert). Default true.
   */
  enabled?: boolean
}

export function useAutoHideOnScroll(opts: AutoHideOptions = {}): boolean {
  const {
    mediaQuery = "(max-width: 767px)",
    threshold = 4,
    minScrollY = 30,
    alwaysActive = false,
    enabled = true,
  } = opts
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const activeRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!enabled) {
      setHidden(false)
      return
    }

    const mq = window.matchMedia(mediaQuery)
    const updateActive = () => {
      activeRef.current = alwaysActive || mq.matches
      if (!activeRef.current) setHidden(false)
    }
    updateActive()
    mq.addEventListener("change", updateActive)

    function onScroll() {
      if (!activeRef.current) return
      const y = window.scrollY
      const dy = y - lastY.current
      if (dy > threshold && y > minScrollY) setHidden(true)
      else if (dy < -threshold) setHidden(false)
      lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", onScroll)
      mq.removeEventListener("change", updateActive)
    }
  }, [mediaQuery, threshold, minScrollY, alwaysActive, enabled])

  return hidden
}
