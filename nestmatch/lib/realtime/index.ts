/**
 * V97.39.21 P3 Phase 4 — Realtime dispatcher Supabase ↔ socket.io self-host.
 *
 * Permet de switcher de Supabase Realtime à socket.io self-host (sur le VPS
 * OVH, service tools/realtime-vps/) via `REALTIME_PROVIDER` env var :
 *   - `supabase` (défaut, comportement historique inchangé)
 *   - `socketio` (self-host)
 *
 * Activation Phase 4 :
 *   1. Phase 2 (Postgres VPS) doit être active
 *   2. Apply migration 085_p3_4_realtime_triggers.sql sur Postgres VPS
 *   3. cd tools/realtime-vps && docker compose up -d
 *   4. Caddy reverse-proxy wss://ws.keymatch-immo.fr (cf Caddyfile.fragment)
 *   5. Set env vars Vercel :
 *      - NEXT_PUBLIC_REALTIME_PROVIDER=socketio
 *      - NEXT_PUBLIC_REALTIME_URL=wss://ws.keymatch-immo.fr
 *   6. Install client SDK : `npm install socket.io-client`
 *   7. Redeploy → tous les hooks useRealtimeSubscription passent en self-host
 *
 * Cf nestmatch/docs/PHASE4_REALTIME_SETUP.md pour la procédure détaillée.
 *
 * ⚠ Les 8 call sites actuels utilisent encore `supabase.channel(...).on(
 * 'postgres_changes', ...)` directement. Cette V livre l'abstraction mais
 * ne migre PAS les call sites (follow-up commit dédié pour ne pas exploser
 * la PR).
 *
 * Migration recommandée par call site :
 *   AVANT : supabase.channel('x').on('postgres_changes', { table: 'messages' }, fn).subscribe()
 *   APRÈS : useRealtimeSubscription('messages', { filter: { conv_id: x } }, fn)
 *
 * Le filter côté hook est appliqué côté CLIENT (Supabase ou socket.io broadcast
 * tout, le hook filtre). Pour des raisons de sécurité, le SERVER filter
 * (côté tools/realtime-vps/src/server.js shouldDeliver) garantit qu'un user
 * ne reçoit que les events qui le concernent (cf shouldDeliver()).
 */

"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

export type RealtimeTable = "messages" | "notifications" | "visites" | "annonces"

export type RealtimeEvent = {
  channel: string
  event: "INSERT" | "UPDATE" | "DELETE"
  table: string
  row: Record<string, unknown>
  truncated?: boolean
}

export type RealtimeFilter = {
  // Filtre côté CLIENT (après réception). Match exact sur la valeur d'un champ.
  // Ex: { conv_id: 123 } ne reçoit que les events où row.conv_id === 123.
  // Aucun filtre = reçoit tous les events du channel autorisés par le server.
  [field: string]: string | number | boolean | null | undefined
}

export type RealtimeOptions = {
  /** Filtre client (en plus du filtre serveur user_email auto) */
  filter?: RealtimeFilter
  /** Si true, déconnecte le hook (utilise useEffect cleanup) */
  enabled?: boolean
}

function resolveProvider(): "supabase" | "socketio" {
  const raw = (process.env.NEXT_PUBLIC_REALTIME_PROVIDER || "supabase").toLowerCase().trim()
  if (raw === "socketio") return "socketio"
  return "supabase"
}

/**
 * Hook React qui abonne à un channel realtime KeyMatch.
 *
 * @param table Table Postgres à écouter (messages, notifications, visites, annonces)
 * @param options Filtre client + flag enabled
 * @param callback Appelé pour chaque event qui passe les filtres serveur ET client
 */
export function useRealtimeSubscription(
  table: RealtimeTable,
  options: RealtimeOptions,
  callback: (event: RealtimeEvent) => void,
): void {
  // Stocke le callback dans un ref pour ne pas re-subscribe à chaque render
  const cbRef = useRef(callback)
  cbRef.current = callback

  const filterStr = options.filter ? JSON.stringify(options.filter) : ""
  const enabled = options.enabled !== false

  useEffect(() => {
    if (!enabled) return

    const provider = resolveProvider()
    if (provider === "socketio") {
      // Lazy load le client socket.io (pas dans le bundle si Phase 4 pas active)
      let cleanup: (() => void) | null = null
      ;(async () => {
        try {
          cleanup = await subscribeSocketio(table, options.filter, ev => cbRef.current(ev))
        } catch (e) {
          console.error("[realtime] socketio subscribe failed", e)
        }
      })()
      return () => {
        if (cleanup) cleanup()
      }
    }

    // Provider = supabase (défaut)
    const channelName = `realtime-${table}-${filterStr || "all"}-${Math.random().toString(36).slice(2, 8)}`
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        payload => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>
          if (options.filter && !matchClientFilter(row, options.filter)) return
          cbRef.current({
            channel: table,
            event: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            table,
            row,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filterStr, enabled])
}

function matchClientFilter(row: Record<string, unknown>, filter: RealtimeFilter): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined) continue
    if (row[key] !== expected) return false
  }
  return true
}

/**
 * Lazy subscribe via socket.io. Importé dynamiquement pour ne pas peser
 * sur le bundle tant que Phase 4 pas active.
 */
async function subscribeSocketio(
  table: RealtimeTable,
  filter: RealtimeFilter | undefined,
  onEvent: (ev: RealtimeEvent) => void,
): Promise<() => void> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — module optionnel non installé tant que Phase 4 pas active
  const socketIoModule = await import("socket.io-client").catch(() => null)
  if (!socketIoModule) {
    console.error("[realtime] socket.io-client non installé. npm install socket.io-client")
    return () => {}
  }
  const io = socketIoModule.io || socketIoModule.default
  const url = process.env.NEXT_PUBLIC_REALTIME_URL || "wss://ws.keymatch-immo.fr"

  // Récupère le JWT NextAuth via /api/auth/token (à exposer côté Next.js)
  // En V97.39.21, on suppose qu'un endpoint /api/auth/realtime-token le fournit.
  const token = await fetchRealtimeToken().catch(() => null)
  if (!token) {
    console.error("[realtime] impossible de récupérer le token, abort subscribe")
    return () => {}
  }

  const socket = io(url, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  })

  socket.on("connect", () => {
    socket.emit("subscribe", { channel: table, filter: filter || {} })
  })

  socket.on("event", (data: RealtimeEvent) => {
    if (filter && !matchClientFilter(data.row, filter)) return
    onEvent(data)
  })

  socket.on("connect_error", (err: Error) => {
    console.warn("[realtime] connect_error", err.message)
  })

  return () => {
    socket.disconnect()
  }
}

async function fetchRealtimeToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/realtime-token", { credentials: "include" })
    if (!res.ok) return null
    const data = await res.json()
    return data.token || null
  } catch {
    return null
  }
}

/**
 * Diagnostic exposé pour /admin/operations.
 */
export function getActiveRealtimeProvider(): { provider: "supabase" | "socketio"; configured: boolean; url?: string } {
  const provider = resolveProvider()
  if (provider === "socketio") {
    return {
      provider: "socketio",
      configured: !!process.env.NEXT_PUBLIC_REALTIME_URL,
      url: process.env.NEXT_PUBLIC_REALTIME_URL,
    }
  }
  return {
    provider: "supabase",
    configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }
}
