// V65.1 — tests /api/messages/mark-read.

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: () => mockSession(),
}))
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

const mockSupaAdmin: Record<string, unknown> = {
  from: vi.fn(),
}
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: mockSupaAdmin,
}))

beforeEach(() => {
  mockSession.mockReset()
  ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockReset()
})

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/messages/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/messages/mark-read", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/messages/mark-read/route")
    const res = await POST(makeReq({ ids: [1, 2] }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si ni ids ni with", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const { POST } = await import("../../app/api/messages/mark-read/route")
    const res = await POST(makeReq({}) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si ids > 200 (anti-flood)", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const ids = Array.from({ length: 250 }, (_, i) => i + 1)
    const { POST } = await import("../../app/api/messages/mark-read/route")
    const res = await POST(makeReq({ ids }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("happy path mode ids", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    // Chain: from.update.in.eq() resolves
    const eqCall = vi.fn().mockResolvedValue({ error: null })
    const inCall = vi.fn(() => ({ eq: eqCall }))
    const update = vi.fn(() => ({ in: inCall }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ update }))

    const { POST } = await import("../../app/api/messages/mark-read/route")
    const res = await POST(makeReq({ ids: [10, 20, 30] }) as unknown as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.count).toBe(3)
  })

  it("renvoie 400 si with email invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const { POST } = await import("../../app/api/messages/mark-read/route")
    const res = await POST(makeReq({ with: "not-an-email" }) as unknown as never)
    expect(res.status).toBe(400)
  })
})
