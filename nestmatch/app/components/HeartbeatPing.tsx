"use client"
/**
 * V59.1 — Composant invisible qui ping `/api/profil/heartbeat` toutes les
 * 60s pour les users authentifiés. Sert à savoir s'ils sont "online" pour
 * la logique anti-spam des emails messages (V59.2).
 *
 * Monté dans le layout root via `<HeartbeatPing />` — doit être un client
 * component pour avoir accès à useSession + setInterval browser.
 *
 * Comportements :
 * - Ping immédiat au mount si authenticated
 * - Re-ping toutes les 60s tant que le user reste sur le site
 * - Cleanup interval au unmount (route change ou logout)
 * - Stop ping si user devient unauthenticated
 * - Heartbeat aussi sur "focus" window (revient dans l'onglet) pour
 *   marquer "online" plus rapidement après une longue absence
 */

import { useEffect } from "react"
import { useSession } from "next-auth/react"

const HEARTBEAT_INTERVAL_MS = 60_000  // 60s

export default function HeartbeatPing() {
  const { status } = useSession()

  useEffect(() => {
    if (status !== "authenticated") return

    let cancelled = false

    function ping() {
      if (cancelled) return
      void fetch("/api/profil/heartbeat", { method: "POST", cache: "no-store" }).catch(() => {
        // Best-effort : si network down, on retentera dans 60s
      })
    }

    // Ping immédiat
    ping()

    // Interval 60s
    const intervalId = window.setInterval(ping, HEARTBEAT_INTERVAL_MS)

    // Re-ping quand l'onglet redevient visible (l'user était parti puis revient)
    const onFocus = () => ping()
    window.addEventListener("focus", onFocus)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [status])

  return null
}
