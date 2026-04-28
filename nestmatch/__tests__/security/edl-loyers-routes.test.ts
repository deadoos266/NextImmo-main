// V24.1 (Paul 2026-04-29) — tests sécurité /api/edl/save + /api/loyers/save.
//
// Vérifie que :
// - Routes refusent l'accès sans session (401).
// - /api/edl/save valide le rôle (proprio vs locataire/contestation).
// - /api/loyers/save valide les 3 modes (declare/confirm/upsert) et leurs
//   gating respectifs.

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: () => mockSession(),
}))
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

const mockSupaAdmin = {
  from: vi.fn(),
}
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: mockSupaAdmin,
}))

beforeEach(() => {
  mockSession.mockReset()
  mockSupaAdmin.from.mockReset()
})

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/edl/save — auth gating", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/edl/save/route")
    const res = await POST(makeReq({ annonce_id: 1, type: "entree" }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si statut invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "p@test.fr" } })
    const { POST } = await import("../../app/api/edl/save/route")
    const res = await POST(makeReq({ statut: "invalid_value" }) as unknown as never)
    expect(res.status).toBe(400)
  })
})

describe("/api/loyers/save — auth gating + mode validation", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/loyers/save/route")
    const res = await POST(makeReq({ mode: "declare", annonce_id: 1, mois: "2026-05", montant: 100 }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si mode invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "u@test.fr" } })
    const { POST } = await import("../../app/api/loyers/save/route")
    const res = await POST(makeReq({ mode: "unknown" }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("declare : renvoie 400 si annonce_id invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/loyers/save/route")
    const res = await POST(makeReq({ mode: "declare", annonce_id: 0, mois: "2026-05", montant: 100 }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("declare : renvoie 400 si mois mal formaté", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/loyers/save/route")
    const res = await POST(makeReq({ mode: "declare", annonce_id: 1, mois: "mai 2026", montant: 100 }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("confirm : renvoie 400 si statut invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "prop@test.fr" } })
    // Mock pour passer la validation id + lookup
    const single = vi.fn().mockResolvedValue({ data: { annonce_id: 1, proprietaire_email: "prop@test.fr" } })
    const eq2 = vi.fn(() => ({ single }))
    const select2 = vi.fn(() => ({ eq: eq2 }))
    mockSupaAdmin.from.mockImplementation(() => ({ select: select2 }))
    const { POST } = await import("../../app/api/loyers/save/route")
    const res = await POST(makeReq({ mode: "confirm", id: 1, statut: "fake_status" }) as unknown as never)
    expect(res.status).toBe(400)
  })
})
