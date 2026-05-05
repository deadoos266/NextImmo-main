// V65.1 — tests DELETE + PATCH /api/messages/[id].

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

const params = Promise.resolve({ id: "42" })

function makeReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/messages/42", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe("/api/messages/[id] DELETE", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { DELETE } = await import("../../app/api/messages/[id]/route")
    const res = await DELETE(makeReq("DELETE") as unknown as never, { params })
    expect(res.status).toBe(401)
  })

  it("renvoie 404 si message introuvable", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))
    const { DELETE } = await import("../../app/api/messages/[id]/route")
    const res = await DELETE(makeReq("DELETE") as unknown as never, { params })
    expect(res.status).toBe(404)
  })

  it("renvoie 403 si from_email != session", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { from_email: "autre@test.fr" } })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))
    const { DELETE } = await import("../../app/api/messages/[id]/route")
    const res = await DELETE(makeReq("DELETE") as unknown as never, { params })
    expect(res.status).toBe(403)
  })
})

describe("/api/messages/[id] PATCH", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { PATCH } = await import("../../app/api/messages/[id]/route")
    const res = await PATCH(makeReq("PATCH", { contenu: "edit" }) as unknown as never, { params })
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si contenu vide", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const { PATCH } = await import("../../app/api/messages/[id]/route")
    const res = await PATCH(makeReq("PATCH", { contenu: "  " }) as unknown as never, { params })
    expect(res.status).toBe(400)
  })

  it("renvoie 409 si window 5min dépassée", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    // created_at il y a 10 min
    const oldIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { from_email: "me@test.fr", created_at: oldIso },
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))

    const { PATCH } = await import("../../app/api/messages/[id]/route")
    const res = await PATCH(makeReq("PATCH", { contenu: "edit" }) as unknown as never, { params })
    expect(res.status).toBe(409)
  })
})
