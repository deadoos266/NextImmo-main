"use client"
import { useEffect } from "react"

/**
 * Enregistrement du service worker côté client.
 *
 * On attend `window.load` pour ne pas rentrer en compétition avec le rendu
 * initial (perf). On ignore en dev (Next.js HMR + SW = cache pourri).
 * Silent fail : si l'enregistrement plante, l'app continue normalement
 * comme un site non-PWA.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[sw] registration failed", err)
        })
    }

    if (document.readyState === "complete") {
      onLoad()
    } else {
      window.addEventListener("load", onLoad, { once: true })
      return () => window.removeEventListener("load", onLoad)
    }
  }, [])

  return null
}
