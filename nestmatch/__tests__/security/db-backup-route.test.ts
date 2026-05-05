// V65.6 — tests /api/cron/db-backup auth.

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupaAdmin: Record<string, unknown> = {
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
      list: vi.fn().mockResolvedValue({ data: [] }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: mockSupaAdmin,
}))

beforeEach(() => {
  ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockReset()
  vi.stubEnv("CRON_SECRET", "test-cron-secret")
})

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {}
  if (authHeader) headers["authorization"] = authHeader
  return new Request("http://localhost/api/cron/db-backup", {
    method: "GET",
    headers,
  })
}

describe("/api/cron/db-backup auth", () => {
  it("renvoie 401 sans Bearer token", async () => {
    const { GET } = await import("../../app/api/cron/db-backup/route")
    const res = await GET(makeReq() as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 401 avec mauvais Bearer token", async () => {
    const { GET } = await import("../../app/api/cron/db-backup/route")
    const res = await GET(makeReq("Bearer wrong-secret") as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 200 avec bon Bearer token", async () => {
    // Mock all from().select() to return empty data
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }))

    const { GET } = await import("../../app/api/cron/db-backup/route")
    const res = await GET(makeReq("Bearer test-cron-secret") as unknown as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.tablesBackedUp).toBeGreaterThan(0)
    expect(typeof json.dateKey).toBe("string")
  })
})
