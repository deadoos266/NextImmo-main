"use client"
import { useCallback, useRef, useState } from "react"

/**
 * V73.1 — hook swipe-to-reveal pattern iOS Mail.
 *
 * Gestion des pointer events vanilla (mouse + touch + pen unifiés via
 * Pointer Events W3C, supporté iOS Safari 13+ et tous les Chrome récents).
 * Pas de lib externe (pas d'overhead bundle).
 *
 * États :
 *  - "closed"   : translateX 0, action cachée
 *  - "open"     : translateX -threshold, action révélée (commit après seuil)
 *  - "drag"     : translateX dynamique (suit le doigt entre 0 et -threshold*1.5)
 *
 * Usage :
 *
 *   const { wrapperProps, contentStyle, isOpen, close } = useSwipeReveal({
 *     threshold: 80,
 *     onCommit: () => setRevealed(true),
 *   })
 *
 *   <li {...wrapperProps} style={{ position: "relative", overflow: "hidden" }}>
 *     <button style={{ position: "absolute", right: 0, top: 0, bottom: 0,
 *                      background: "#DC2626", color: "white" }}>
 *       Supprimer
 *     </button>
 *     <div style={contentStyle}>...content...</div>
 *   </li>
 *
 * Le contentStyle applique le translateX dynamique. Click sur le bouton
 * révélé déclenche la suppression. Click ailleurs (sur le contenu après
 * commit) → reset à 0 (pattern iOS Mail).
 */

interface Options {
  /** Distance en px à dépasser pour révéler l'action (défaut 80). */
  threshold?: number
  /** Callback déclenché quand le swipe a dépassé le threshold (commit). */
  onCommit?: () => void
  /** Direction autorisée. Défaut "left" (swipe gauche = action droite révélée). */
  direction?: "left" | "right"
  /** Si true, désactive complètement le hook (skip handlers). */
  disabled?: boolean
}

interface SwipeState {
  startX: number
  startY: number
  currentX: number
  active: boolean
  /** Verrouille à "scroll" si l'user a bougé verticalement >10px avant horizontalement. */
  lockedAxis: null | "x" | "y"
}

export function useSwipeReveal({ threshold = 80, onCommit, direction = "left", disabled }: Options = {}) {
  const [translateX, setTranslateX] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const stateRef = useRef<SwipeState>({ startX: 0, startY: 0, currentX: 0, active: false, lockedAxis: null })

  const close = useCallback(() => {
    setTranslateX(0)
    setIsOpen(false)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return
    // Pas de capture sur les pointer types qui ne sont pas tactile/souris
    // (évite les conflits avec le scroll iOS Safari).
    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      active: true,
      lockedAxis: null,
    }
  }, [disabled])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (disabled) return
    const s = stateRef.current
    if (!s.active) return

    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY

    // Détection axe : si l'user a bougé verticalement >10px en premier,
    // c'est un scroll, on désactive le swipe pour cette interaction.
    if (s.lockedAxis === null) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        s.lockedAxis = "y"
        return
      }
      if (Math.abs(dx) > 10) {
        s.lockedAxis = "x"
        // Capture le pointer pour que les events suivants arrivent toujours
        // sur cet élément même si le doigt sort de la box.
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch { /* ignore */ }
      }
    }

    if (s.lockedAxis !== "x") return

    // Direction : "left" = swipe vers la gauche révèle l'action droite.
    // dx négatif = main bouge vers la gauche → translate négatif.
    const allowed = direction === "left" ? Math.min(0, dx) : Math.max(0, dx)
    // Damping au-delà de threshold * 1.5 (résistance type iOS).
    const max = threshold * 1.5
    const clamped = direction === "left"
      ? Math.max(allowed, -max)
      : Math.min(allowed, max)

    s.currentX = e.clientX
    setTranslateX(clamped)
  }, [disabled, direction, threshold])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (disabled) return
    const s = stateRef.current
    if (!s.active) return
    s.active = false

    if (s.lockedAxis !== "x") return

    const dx = s.currentX - s.startX
    const passedThreshold = direction === "left"
      ? dx < -threshold
      : dx > threshold

    if (passedThreshold) {
      // Commit : translate au threshold exact + onCommit
      setTranslateX(direction === "left" ? -threshold : threshold)
      setIsOpen(true)
      onCommit?.()
    } else {
      // Pas atteint → snap-back à 0
      setTranslateX(0)
      setIsOpen(false)
    }

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch { /* ignore */ }
  }, [disabled, direction, threshold, onCommit])

  const onPointerCancel = useCallback(() => {
    if (disabled) return
    setTranslateX(0)
    setIsOpen(false)
    stateRef.current.active = false
    stateRef.current.lockedAxis = null
  }, [disabled])

  return {
    /** Spread sur le wrapper qui contient le bouton révélé + le contenu. */
    wrapperProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: { touchAction: "pan-y" as const },
    },
    /** Style à appliquer au contenu visible (qui se déplace). */
    contentStyle: {
      transform: `translateX(${translateX}px)`,
      transition: stateRef.current.active ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      willChange: "transform",
    } satisfies React.CSSProperties,
    /** True si le swipe a dépassé le seuil (action révélée). */
    isOpen,
    /** Reset programmatique (à appeler après l'action de suppression). */
    close,
    /** Distance actuelle en px (négative pour swipe-left). */
    translateX,
  }
}
