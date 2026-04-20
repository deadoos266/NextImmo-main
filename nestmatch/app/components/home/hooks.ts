"use client"
import { useEffect, useState, useRef } from "react"

/**
 * Hooks partagés pour la Home — animations, typewriter, count-up, intervals.
 * Tous respectent `prefers-reduced-motion` : quand l'OS de l'user demande la
 * réduction d'animations, les valeurs cibles sont posées immédiatement.
 */

/** True si l'OS a activé "Reduce motion". Re-évalue au changement. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return reduced
}

/** setInterval en hook. Si `on=false`, pas de timer. Cleanup auto. */
export function useInterval(on: boolean, fn: () => void, ms: number) {
  // Ref pour avoir toujours la dernière version de `fn` sans relancer le timer.
  const saved = useRef(fn)
  useEffect(() => { saved.current = fn }, [fn])
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => saved.current(), ms)
    return () => clearInterval(id)
  }, [on, ms])
}

/**
 * Typewriter : tape chaque phrase caractère par caractère, marque une pause,
 * efface, passe à la suivante. Si reduced-motion : affiche la 1ère phrase
 * complète, statique.
 */
export function useTypewriter(
  phrases: string[],
  { type = 65, erase = 30, pause = 1800 }: { type?: number; erase?: number; pause?: number } = {}
): string {
  const reduced = useReducedMotion()
  const [text, setText] = useState("")
  const [i, setI] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1) // 1 = typing, -1 = erasing

  useEffect(() => {
    if (reduced) {
      setText(phrases[0] ?? "")
      return
    }
    if (phrases.length === 0) return
    const phrase = phrases[i % phrases.length]
    if (dir === 1 && text === phrase) {
      const t = setTimeout(() => setDir(-1), pause)
      return () => clearTimeout(t)
    }
    if (dir === -1 && text === "") {
      setDir(1)
      setI(v => v + 1)
      return
    }
    const t = setTimeout(() => {
      setText(dir === 1 ? phrase.slice(0, text.length + 1) : text.slice(0, -1))
    }, dir === 1 ? type : erase)
    return () => clearTimeout(t)
  }, [text, dir, i, phrases, type, erase, pause, reduced])

  return text
}

/**
 * Count-up animation : interpolation ease-out-cubic de 0 → target sur `duration`.
 * Reduced-motion : pose directement la valeur cible.
 */
export function useCountUp(
  target: number,
  { duration = 1400, delay = 0 }: { duration?: number; delay?: number } = {}
): number {
  const reduced = useReducedMotion()
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (reduced) { setVal(target); return }
    const start = performance.now() + delay
    let raf = 0
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration))
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay, reduced])
  return val
}

/**
 * Fade-in au scroll via IntersectionObserver. Retourne un tuple [ref, visible].
 * Reduced-motion : visible=true d'entrée.
 */
export function useFadeIn<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const reduced = useReducedMotion()
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (reduced) { setVisible(true); return }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])
  return [ref, visible]
}
