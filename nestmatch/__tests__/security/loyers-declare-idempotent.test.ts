// V62 (Paul 2026-05-03) — Tests anti-doublon /api/loyers/save mode declare.
//
// Régression V62 : auto-paiement effect de /mon-logement + double-clic
// pouvaient insérer 2 rows loyers même mois (pas de UNIQUE en DB).
// Fix : check préalable .eq("annonce_id").eq("mois") + retour idempotent.

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
  return new Request("http://localhost/api/loyers/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/loyers/save — declare idempotent (V62 anti-doublon)", () => {
  it("retourne alreadyDeclared:true si row existe déjà pour (annonce, mois)", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })

    // Mock chain pour annonce check (locataire OK)
    const annonceLookup = {
      single: vi.fn().mockResolvedValue({
        data: { locataire_email: "loc@test.fr", proprietaire_email: "prop@test.fr" },
        error: null,
      }),
    }
    // Mock chain pour existing loyer lookup
    const loyerLookup = {
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 42, annonce_id: 1, mois: "2026-05", statut: "déclaré", montant: 850 },
        error: null,
      }),
    }

    let callCount = 0
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      callCount++
      if (table === "annonces") {
        return {
          select: () => ({ eq: () => annonceLookup }),
        }
      }
      if (table === "loyers") {
        // Le 2ᵉ appel sur loyers = check existant
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => loyerLookup,
                }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const { POST } = await import("../../app/api/loyers/save/route")
    const res = await POST(makeReq({
      mode: "declare",
      annonce_id: 1,
      mois: "2026-05",
      montant: 850,
    }) as unknown as never)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.alreadyDeclared).toBe(true)
    expect(json.loyer.id).toBe(42)
  })

  it("renvoie 403 si session.email != annonce.locataire_email", async () => {
    mockSession.mockResolvedValue({ user: { email: "intrus@test.fr" } })
    const annonceLookup = {
      single: vi.fn().mockResolvedValue({
        data: { locataire_email: "vrai-loc@test.fr", proprietaire_email: "prop@test.fr" },
        error: null,
      }),
    }
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      select: () => ({ eq: () => annonceLookup }),
    }))

    const { POST } = await import("../../app/api/loyers/save/route")
    const res = await POST(makeReq({
      mode: "declare",
      annonce_id: 1,
      mois: "2026-05",
      montant: 850,
    }) as unknown as never)
    expect(res.status).toBe(403)
  })
})
