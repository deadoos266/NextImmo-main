// V63 — tests sécurité /api/messages (POST générique).

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: () => mockSession(),
}))
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: () => "127.0.0.1",
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
  return new Request("http://localhost/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/messages — POST", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/messages/route")
    const res = await POST(makeReq({ toEmail: "x@y.fr", contenu: "hi" }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si toEmail invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const { POST } = await import("../../app/api/messages/route")
    const res = await POST(makeReq({ toEmail: "not-an-email", contenu: "hi" }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si contenu vide", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const { POST } = await import("../../app/api/messages/route")
    const res = await POST(makeReq({ toEmail: "x@y.fr", contenu: "   " }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si message à soi-même", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const { POST } = await import("../../app/api/messages/route")
    const res = await POST(makeReq({ toEmail: "me@test.fr", contenu: "hi" }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("happy path : insert OK + retour { ok, message }", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const single = vi.fn().mockResolvedValue({ data: { id: 99, created_at: "2026-05-03T10:00:00Z" }, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ insert }))
    const { POST } = await import("../../app/api/messages/route")
    const res = await POST(makeReq({ toEmail: "you@test.fr", annonceId: 12, contenu: "Bonjour !" }) as unknown as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.message.id).toBe(99)
  })
})
