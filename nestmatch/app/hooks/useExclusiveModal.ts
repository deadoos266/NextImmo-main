"use client"
import { useEffect } from "react"

/**
 * V72.1d — gestionnaire de modals exclusives (1 seule ouverte à la fois).
 *
 * User : "les pop-ups s'accumulent en arrière-plan". Symptôme : ouverture
 * d'un nouveau dialog (proposer visite, signer bail, etc.) sans fermer le
 * précédent → accumulation visuelle (multiple scrim, z-index war).
 *
 * Stratégie : un registry global au runtime (`window.__keymatchModalStack`)
 * qui track les modals ouvertes par id. À chaque ouverture, on ferme toutes
 * les autres. Esc ferme la top. Scroll-lock automatique sur body.
 *
 * Usage type :
 *
 *   useExclusiveModal({ id: "proposer-visite", open, onClose })
 *
 * Pas de provider à wrapper, pas de Context — juste un hook self-contained.
 * Compatible SSR (no-op si window est undefined).
 */

interface RegistryEntry {
  id: string
  closeFn: () => void
}

interface RegistryWindow extends Window {
  __keymatchModalStack?: RegistryEntry[]
  __keymatchModalEscBound?: boolean
}

function getStack(): RegistryEntry[] {
  if (typeof window === "undefined") return []
  const w = window as RegistryWindow
  if (!w.__keymatchModalStack) w.__keymatchModalStack = []
  return w.__keymatchModalStack
}

function bindEscOnce() {
  if (typeof window === "undefined") return
  const w = window as RegistryWindow
  if (w.__keymatchModalEscBound) return
  w.__keymatchModalEscBound = true
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return
    const stack = getStack()
    const top = stack[stack.length - 1]
    if (!top) return
    e.stopPropagation()
    top.closeFn()
  })
}

function lockBodyScroll(lock: boolean) {
  if (typeof document === "undefined") return
  if (lock) {
    document.body.style.overflow = "hidden"
    document.body.style.touchAction = "none"
  } else {
    // Ne dé-lock que si plus aucun modal n'est ouvert.
    if (getStack().length === 0) {
      document.body.style.overflow = ""
      document.body.style.touchAction = ""
    }
  }
}

interface Options {
  /**
   * Identifiant unique de la modal. Si une autre modal du même id est déjà
   * ouverte au moment où celle-ci s'ouvre, la précédente est fermée
   * silencieusement.
   */
  id: string
  /** État ouvert / fermé contrôlé par le parent. */
  open: boolean
  /** Callback de fermeture (sera appelé sur Esc, scrim click via parent, ou eviction par une autre modal). */
  onClose: () => void
  /**
   * Si true, force la fermeture de TOUTES les autres modals à l'ouverture.
   * Si false (default), seules les modals avec le même id sont évincées.
   * Utiliser true pour les flows critiques (ex: signature bail) qui ne
   * doivent jamais coexister avec un autre dialog.
   */
  exclusive?: boolean
}

export function useExclusiveModal({ id, open, onClose, exclusive = true }: Options): void {
  useEffect(() => {
    if (!open) return
    const stack = getStack()
    bindEscOnce()

    // Évince les autres entries selon la politique demandée.
    if (exclusive) {
      // Ferme tout sauf nous.
      const others = stack.filter(e => e.id !== id)
      stack.length = 0
      // Ne pas ré-injecter les autres (ils seront fermés par leur own onClose
      // quand on appelle leur closeFn → ils ré-effectent leur cleanup).
      for (const o of others) {
        try { o.closeFn() } catch { /* ignore */ }
      }
    } else {
      // Ferme uniquement les entries du même id (cas d'un même dialog ouvert
      // 2× par bug — re-render parent). Évite les doublons.
      const sameId = stack.filter(e => e.id === id)
      if (sameId.length > 0) {
        for (const o of sameId) {
          try { o.closeFn() } catch { /* ignore */ }
        }
        // Purge les entries du même id du stack.
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].id === id) stack.splice(i, 1)
        }
      }
    }

    // Push notre entry.
    const entry: RegistryEntry = { id, closeFn: onClose }
    stack.push(entry)
    lockBodyScroll(true)

    return () => {
      // Cleanup au close ou unmount : retire notre entry et release le
      // scroll-lock si on était la dernière.
      const s = getStack()
      const idx = s.indexOf(entry)
      if (idx !== -1) s.splice(idx, 1)
      lockBodyScroll(false)
    }
  }, [open, id, onClose, exclusive])
}
