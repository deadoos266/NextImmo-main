"use client"
import { useEffect } from "react"

/**
 * ⚠️ Phase diagnostic React #418 (2026-04-21) : le service worker est
 * TEMPORAIREMENT désactivé. Il cachait `/_next/static/chunks/*` en
 * stale-while-revalidate ce qui, combiné à des déploiements fréquents,
 * pouvait servir un chunk JS v1 à côté d'un HTML v2 qui attend v2 →
 * mismatch d'hydration → React #418 → tree détruit → "annonces qui
 * disparaissent".
 *
 * Ici on FORCE le désenregistrement chez tous les users qui avaient
 * déjà le SW installé, puis on purge TOUTES les caches SW. Au prochain
 * reload, plus rien côté SW — c'est Vercel edge + browser cache qui
 * décident, ce qui est déterministe par build.
 *
 * À réactiver quand le bug est confirmé d'une autre source + SW revu.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    // 1) Désinscrit tout SW existant
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => { /* silent */ })

    // 2) Purge toutes les Cache Storage entries
    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => { /* silent */ })
    }
  }, [])

  return null
}
