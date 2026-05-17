/**
 * V97.39.21 P3 Phase 4 — Tests realtime dispatcher Supabase ↔ socket.io.
 *
 * Tests SSR-safe : on importe lib/realtime sans le hook React (qui nécessite
 * client). On teste juste `getActiveRealtimeProvider()` + le matchClientFilter
 * via internal export (TODO si on en a besoin).
 *
 * Pour les tests UI complets du hook : à faire avec Playwright sur preview Vercel.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"

describe("realtime dispatcher (lib/realtime/index.ts)", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_REALTIME_PROVIDER
    delete process.env.NEXT_PUBLIC_REALTIME_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("getActiveRealtimeProvider défaut = supabase configuré", async () => {
    const { getActiveRealtimeProvider } = await import("@/lib/realtime")
    const p = getActiveRealtimeProvider()
    expect(p.provider).toBe("supabase")
    expect(p.configured).toBe(true)
    expect(p.url).toBe("https://test.supabase.co")
  })

  it("getActiveRealtimeProvider NEXT_PUBLIC_REALTIME_PROVIDER=socketio sans URL → not configured", async () => {
    process.env.NEXT_PUBLIC_REALTIME_PROVIDER = "socketio"
    const { getActiveRealtimeProvider } = await import("@/lib/realtime")
    const p = getActiveRealtimeProvider()
    expect(p.provider).toBe("socketio")
    expect(p.configured).toBe(false)
  })

  it("getActiveRealtimeProvider NEXT_PUBLIC_REALTIME_PROVIDER=socketio + URL → configured", async () => {
    process.env.NEXT_PUBLIC_REALTIME_PROVIDER = "socketio"
    process.env.NEXT_PUBLIC_REALTIME_URL = "wss://ws.keymatch-immo.fr"
    const { getActiveRealtimeProvider } = await import("@/lib/realtime")
    const p = getActiveRealtimeProvider()
    expect(p.provider).toBe("socketio")
    expect(p.configured).toBe(true)
    expect(p.url).toBe("wss://ws.keymatch-immo.fr")
  })

  it("provider inconnu → fallback supabase", async () => {
    process.env.NEXT_PUBLIC_REALTIME_PROVIDER = "ablyio"
    const { getActiveRealtimeProvider } = await import("@/lib/realtime")
    expect(getActiveRealtimeProvider().provider).toBe("supabase")
  })
})
