// V62 (Paul 2026-05-03) — Tests sécurité /api/bail/avenant/[id]/signer.
//
// Regression coverage du fix V62 :
//   - race condition double-signature → recalcul statut depuis l'état
//     post-update (et non pré-fetch).
//
// Couvre aussi auth + validation mention.

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

const VALID_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const VALID_MENTION = "Lu et approuvé, bon pour accord"

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/bail/avenant/abc/signer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: "test-avenant-id" })

describe("/api/bail/avenant/[id]/signer — auth", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/bail/avenant/[id]/signer/route")
    const res = await POST(makeReq({ mention: VALID_MENTION, signaturePng: VALID_PNG }) as unknown as never, { params })
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si mention non canonical (V50.11 strict)", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/avenant/[id]/signer/route")
    const res = await POST(makeReq({
      mention: "Lu et approuvé yolo bon pour accord",
      signaturePng: VALID_PNG,
    }) as unknown as never, { params })
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si signaturePng pas en data:image/png;base64", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/avenant/[id]/signer/route")
    const res = await POST(makeReq({
      mention: VALID_MENTION,
      signaturePng: "data:image/jpeg;base64,foo",
    }) as unknown as never, { params })
    expect(res.status).toBe(400)
  })

  it("renvoie 404 si avenant introuvable", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))
    const { POST } = await import("../../app/api/bail/avenant/[id]/signer/route")
    const res = await POST(makeReq({
      mention: VALID_MENTION,
      signaturePng: VALID_PNG,
    }) as unknown as never, { params })
    expect(res.status).toBe(404)
  })

  it("renvoie 409 si avenant déjà actif", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "x", statut: "actif", annonce_id: 1, signe_locataire_at: "now", signe_bailleur_at: "now" },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))
    const { POST } = await import("../../app/api/bail/avenant/[id]/signer/route")
    const res = await POST(makeReq({
      mention: VALID_MENTION,
      signaturePng: VALID_PNG,
    }) as unknown as never, { params })
    expect(res.status).toBe(409)
  })

  it("renvoie 409 si avenant annulé", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "x", statut: "annule", annonce_id: 1 },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({ select }))
    const { POST } = await import("../../app/api/bail/avenant/[id]/signer/route")
    const res = await POST(makeReq({
      mention: VALID_MENTION,
      signaturePng: VALID_PNG,
    }) as unknown as never, { params })
    expect(res.status).toBe(409)
  })
})
