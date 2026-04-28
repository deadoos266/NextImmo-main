// V24.3 (Paul 2026-04-29) — tests sécurité /api/profil/save.
//
// Vérifie que :
// - 401 sans session (anon ne peut rien écrire).
// - email forcé = session.user.email (anti-spoof : un user ne peut pas
//   écrire le profil d'un autre).
// - admin-only fields (is_admin, is_banned) filtrés du payload.

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: () => mockSession(),
}))
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

// Capture le payload final passé à upsert pour vérifier email forcé + filter
const capturedUpsert = vi.fn()
const supaMock = {
  from: vi.fn(() => ({
    upsert: (payload: unknown, opts: unknown) => {
      capturedUpsert(payload, opts)
      return {
        select: () => ({
          single: () => Promise.resolve({ data: payload, error: null }),
        }),
      }
    },
  })),
}
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: supaMock,
}))

beforeEach(() => {
  mockSession.mockReset()
  capturedUpsert.mockReset()
})

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/profil/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/profil/save — auth + anti-spoof + admin-fields filter", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/profil/save/route")
    const res = await POST(makeReq({ telephone: "0611111111" }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("force email = session (anti-spoof) — ignore client email", async () => {
    mockSession.mockResolvedValue({ user: { email: "victim@test.fr" } })
    const { POST } = await import("../../app/api/profil/save/route")
    await POST(makeReq({ email: "attacker@test.fr", telephone: "0699" }) as unknown as never)
    const [payload] = capturedUpsert.mock.calls[0]
    expect((payload as { email: string }).email).toBe("victim@test.fr")
  })

  it("filtre les champs admin-only is_admin / is_banned", async () => {
    mockSession.mockResolvedValue({ user: { email: "u@test.fr" } })
    const { POST } = await import("../../app/api/profil/save/route")
    await POST(makeReq({
      telephone: "0611",
      is_admin: true,
      is_banned: true,
      ban_reason: "self-elevation attempt",
    }) as unknown as never)
    const [payload] = capturedUpsert.mock.calls[0]
    expect("is_admin" in (payload as object)).toBe(false)
    expect("is_banned" in (payload as object)).toBe(false)
    expect("ban_reason" in (payload as object)).toBe(false)
    expect((payload as { telephone: string }).telephone).toBe("0611")
  })

  it("renvoie 400 sur body JSON invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "u@test.fr" } })
    const { POST } = await import("../../app/api/profil/save/route")
    const req = new Request("http://localhost/api/profil/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{",
    })
    const res = await POST(req as unknown as never)
    expect(res.status).toBe(400)
  })
})
