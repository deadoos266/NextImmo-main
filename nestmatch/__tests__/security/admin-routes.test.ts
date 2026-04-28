// V12 (Paul 2026-04-28) — tests sécurité des nouvelles routes /api/admin/*.
//
// Ces tests vérifient que les routes ne servent PAS de données sensibles
// sans une session valide ET un flag is_admin. Si un attaquant accède
// directement à l'endpoint sans NextAuth session, il doit recevoir 401.
// Avec une session non-admin, il doit recevoir 403.
//
// Note : on mock getServerSession et supabaseAdmin pour tester la logique
// de gating sans vraiment toucher la DB. Test contractuel sur la garde
// d'authentification, pas un test d'intégration end-to-end.

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock NextAuth
const mockSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: () => mockSession(),
}))

// Mock authOptions (n'est pas utilisé par les mocks mais l'import existe)
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

// Mock supabaseAdmin — chaque méthode renvoie un { data, error } prévisible.
type SupabaseStub = {
  data?: unknown
  error?: { message: string } | null
}
const stubData: SupabaseStub = { data: [], error: null }
const supabaseAdminMock = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(stubData)),
      })),
      limit: vi.fn(() => Promise.resolve(stubData)),
    })),
  })),
}
// On mock le module entier pour simplifier — chaque route utilise
// supabaseAdmin.from(...).select(...) etc. via différentes chaines.
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: supabaseAdminMock,
}))

beforeEach(() => {
  mockSession.mockReset()
  supabaseAdminMock.from.mockClear()
})

// ─── /api/admin/dashboard ─────────────────────────────────────────────────
describe("/api/admin/dashboard GET — auth gating", () => {
  it("renvoie 401 si non authentifié", async () => {
    mockSession.mockResolvedValue(null)
    const { GET } = await import("../../app/api/admin/dashboard/route")
    const res = await GET()
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it("renvoie 403 si authentifié mais pas admin", async () => {
    mockSession.mockResolvedValue({ user: { email: "user@test.fr", isAdmin: false } })
    const { GET } = await import("../../app/api/admin/dashboard/route")
    const res = await GET()
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.success).toBe(false)
  })
})

// ─── /api/admin/users PATCH ───────────────────────────────────────────────
describe("/api/admin/users PATCH — auth gating + self-action guards", () => {
  function makeReq(body: unknown): Request {
    return new Request("http://localhost/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { PATCH } = await import("../../app/api/admin/users/route")
    const res = await PATCH(makeReq({ kind: "ban", email: "victim@test.fr", ban_reason: "spam" }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 403 si session non-admin", async () => {
    mockSession.mockResolvedValue({ user: { email: "user@test.fr", isAdmin: false } })
    const { PATCH } = await import("../../app/api/admin/users/route")
    const res = await PATCH(makeReq({ kind: "ban", email: "victim@test.fr", ban_reason: "spam" }) as unknown as never)
    expect(res.status).toBe(403)
  })

  it("renvoie 400 si payload invalide (zod)", async () => {
    mockSession.mockResolvedValue({ user: { email: "admin@test.fr", isAdmin: true } })
    const { PATCH } = await import("../../app/api/admin/users/route")
    const res = await PATCH(makeReq({ kind: "unknown", email: "x@y.fr" }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("garde-fou : un admin ne peut pas retirer ses propres droits admin", async () => {
    mockSession.mockResolvedValue({ user: { email: "admin@test.fr", isAdmin: true } })
    const { PATCH } = await import("../../app/api/admin/users/route")
    const res = await PATCH(makeReq({ kind: "toggle_admin", email: "admin@test.fr", is_admin: false }) as unknown as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/propres droits admin/)
  })

  it("garde-fou : un admin ne peut pas se bannir lui-même", async () => {
    mockSession.mockResolvedValue({ user: { email: "admin@test.fr", isAdmin: true } })
    const { PATCH } = await import("../../app/api/admin/users/route")
    const res = await PATCH(makeReq({ kind: "ban", email: "admin@test.fr", ban_reason: "x" }) as unknown as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/se bannir/)
  })
})

// ─── /api/admin/annonces PATCH ────────────────────────────────────────────
describe("/api/admin/annonces PATCH — auth gating", () => {
  function makeReq(body: unknown): Request {
    return new Request("http://localhost/api/admin/annonces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { PATCH } = await import("../../app/api/admin/annonces/route")
    const res = await PATCH(makeReq({ ids: [1], is_test: true }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 403 si non-admin", async () => {
    mockSession.mockResolvedValue({ user: { email: "user@test.fr", isAdmin: false } })
    const { PATCH } = await import("../../app/api/admin/annonces/route")
    const res = await PATCH(makeReq({ ids: [1], is_test: true }) as unknown as never)
    expect(res.status).toBe(403)
  })

  it("renvoie 400 si ids vide", async () => {
    mockSession.mockResolvedValue({ user: { email: "admin@test.fr", isAdmin: true } })
    const { PATCH } = await import("../../app/api/admin/annonces/route")
    const res = await PATCH(makeReq({ ids: [], is_test: true }) as unknown as never)
    expect(res.status).toBe(400)
  })
})

// ─── /api/admin/messages GET ──────────────────────────────────────────────
describe("/api/admin/messages GET — auth gating + email validation", () => {
  // NextRequest a un getter `nextUrl` sur l'URL — on simule en fournissant
  // un objet minimal compatible. Pour le test 401/403, le code n'atteint
  // jamais .nextUrl donc on peut passer null. Pour 400, on construit un
  // objet avec searchParams.
  function makeReq(qs?: string) {
    if (qs === undefined) return null as unknown as never
    const url = new URL(`http://localhost/api/admin/messages?${qs}`)
    return { nextUrl: url } as unknown as never
  }

  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { GET } = await import("../../app/api/admin/messages/route")
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it("renvoie 403 si non-admin", async () => {
    mockSession.mockResolvedValue({ user: { email: "user@test.fr", isAdmin: false } })
    const { GET } = await import("../../app/api/admin/messages/route")
    const res = await GET(makeReq())
    expect(res.status).toBe(403)
  })

  it("renvoie 400 si email invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "admin@test.fr", isAdmin: true } })
    const { GET } = await import("../../app/api/admin/messages/route")
    const res = await GET(makeReq("a=notanemail&b=u2@test.fr"))
    expect(res.status).toBe(400)
  })
})
