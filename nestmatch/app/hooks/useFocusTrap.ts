"use client"
import { useEffect, useRef } from "react"

/**
 * V81.31 — Hook focus trap pour les modales / dialogs.
 *
 * Audit a11y V81.29 (HIGH #5) : BottomNavSheet + Navbar drawer ont
 * role="dialog" aria-modal="true" mais aucun focus trap → l'utilisateur
 * clavier sort du modal via Tab et se retrouve perdu dans le DOM derrière
 * le scrim. Violation WCAG 2.1.2 (No keyboard trap, en sens inverse).
 *
 * Usage :
 *   const containerRef = useFocusTrap<HTMLDivElement>(open)
 *   return <div ref={containerRef}>...</div>
 *
 * Comportement :
 *  - À l'ouverture : focus auto sur le 1er élément focusable du container.
 *  - Pendant : Tab cycle entre les éléments focusables internes.
 *  - Shift+Tab inversé.
 *  - À la fermeture : focus restauré sur l'élément qui avait le focus
 *    avant l'ouverture (pattern WAI-ARIA APG).
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    if (typeof window === "undefined") return
    const container = ref.current
    if (!container) return

    // Mémoriser l'élément qui avait le focus avant d'ouvrir
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null

    const getFocusable = (): HTMLElement[] => {
      const selector = [
        'a[href]:not([disabled])',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ')
      return Array.from(container.querySelectorAll<HTMLElement>(selector))
        .filter(el => el.offsetParent !== null) // only visible
    }

    // Focus initial sur le 1er élément focusable (après tick pour laisser
    // le DOM se monter complètement)
    const t = setTimeout(() => {
      const focusables = getFocusable()
      if (focusables.length > 0) focusables[0].focus()
    }, 50)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return
      const focusables = getFocusable()
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeEl = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        // Shift+Tab depuis le 1er → boucler sur le dernier
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab depuis le dernier → boucler sur le 1er
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener("keydown", onKeyDown)
    return () => {
      clearTimeout(t)
      container.removeEventListener("keydown", onKeyDown)
      // Restaurer focus
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === "function") {
        try { prev.focus() } catch { /* élément démonté */ }
      }
    }
  }, [active])

  return ref
}
