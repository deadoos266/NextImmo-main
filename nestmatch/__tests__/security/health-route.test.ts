// V64 — tests /api/health (uptime monitoring endpoint).

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupaAdmin: Record<string, unknown> = {
  from: vi.fn(),
}
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: mockSupaAdmin,
}))

beforeEach(() => {
  ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockReset()
})

describe("/api/health", () => {
  it("retourne 200 OK avec status='ok' si Supabase répond", async () => {
    // Mock Supabase OK
    const limit = vi.fn().mockResolvedValue({ count: 42, error: null })
    const select = vi.fn(() => ({ limit }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))

    const { GET } = await import("../../app/api/health/route")
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe("ok")
    expect(json.services.supabase.status).toBe("ok")
    expect(typeof json.services.supabase.latency_ms).toBe("number")
    expect(json.uptime_check).toBe(true)
    expect(typeof json.timestamp).toBe("string")
  })

  it("retourne 503 si Supabase échoue", async () => {
    const limit = vi.fn().mockResolvedValue({ count: null, error: { message: "connection refused" } })
    const select = vi.fn(() => ({ limit }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))

    const { GET } = await import("../../app/api/health/route")
    const res = await GET()
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.status).toBe("degraded")
    expect(json.services.supabase.status).toBe("down")
    expect(json.services.supabase.error).toContain("connection refused")
  })

  it("Cache-Control: no-store pour live check", async () => {
    const limit = vi.fn().mockResolvedValue({ count: 0, error: null })
    const select = vi.fn(() => ({ limit }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))

    const { GET } = await import("../../app/api/health/route")
    const res = await GET()
    expect(res.headers.get("Cache-Control")).toContain("no-store")
  })
})
