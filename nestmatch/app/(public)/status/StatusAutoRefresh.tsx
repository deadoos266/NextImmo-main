"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Sous-composant client de /status. Refresh la page toutes les `intervalMs`
 * via `router.refresh()` (Next 15 — re-fetch le RSC sans hard reload).
 * Pause automatiquement quand l'onglet est en arrière-plan pour éviter
 * la consommation inutile.
 */
export default function StatusAutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter()
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    function start() {
      if (timer) return
      timer = setInterval(() => {
        router.refresh()
      }, intervalMs)
    }
    function stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") start()
      else stop()
    }

    if (typeof document !== "undefined" && document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [intervalMs, router])

  return null
}
