"use client"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Pattern "optimistic delete + undo 5 sec".
 *
 * Flux :
 *   1. Le caller retire l'item de l'UI immédiatement (optimistic).
 *   2. Appelle `trigger(item)` — l'item devient "pending".
 *   3. Si l'user clique "Annuler" avant la fin du timer, `undo()` annule
 *      le commit et le caller doit restaurer l'item dans son state.
 *   4. Si le timer expire, `onConfirm(item)` est appelé — c'est là qu'on
 *      fait l'appel API DELETE réel.
 *
 * Un seul item pending à la fois : déclencher un nouveau trigger annule le
 * timer courant et force-commit l'item précédent (évite de perdre un delete
 * silencieusement quand l'user enchaîne les suppressions).
 */
export type UseUndoOpts<T> = {
  delayMs?: number
  onConfirm: (item: T) => Promise<void> | void
}

export function useUndo<T>({ delayMs = 5000, onConfirm }: UseUndoOpts<T>) {
  const [pending, setPending] = useState<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // On garde onConfirm dans une ref pour éviter de recréer trigger à chaque
  // render (le caller passe souvent une closure qui capture du state frais).
  const onConfirmRef = useRef(onConfirm)
  useEffect(() => { onConfirmRef.current = onConfirm }, [onConfirm])

  const commit = useCallback((item: T) => {
    Promise.resolve(onConfirmRef.current(item)).finally(() => {
      setPending(current => (current === item ? null : current))
    })
  }, [])

  const trigger = useCallback((item: T) => {
    // Si un autre item est déjà pending, on le commit immédiatement
    // (sinon il resterait coincé en "pending" sans jamais être delete).
    setPending(prev => {
      if (prev !== null && prev !== item) commit(prev)
      return item
    })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      commit(item)
    }, delayMs)
  }, [delayMs, commit])

  const undo = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setPending(null)
  }, [])

  // Cleanup si le composant démonte alors qu'un delete est pending :
  // on commit maintenant plutôt que de perdre silencieusement l'action.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        if (pending !== null) commit(pending)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { pending, trigger, undo }
}
