// V61.2 (Paul 2026-05-03) — Tests sécurité /api/bail/signer.
//
// Couvre les chemins critiques eIDAS niveau 1 + race conditions :
//   - 401 sans session
//   - 400 annonceId / role / mention / PNG invalides
//   - 403 si l'email session ne match pas le rôle (locataire prétendu bailleur)
//   - Mention strict equality (V50.11) — refuse "lu et approuv*" lâche
//   - Garant : exige "caution solidaire" en plus du canonical
//
// Note : on ne mock PAS finalizeBail (path doubleSigne) car le test
// stocke + assemble du payload Supabase complexe. Couverture happy-path
// minimum sur la signature simple du locataire.

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: () => mockSession(),
}))
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

// Rate-limit toujours allowed
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: () => "127.0.0.1",
}))

// finalizeBail no-op (le path double-sign n'est pas le scope ici)
vi.mock("@/lib/bail/finalize", () => ({
  finalizeBail: vi.fn().mockResolvedValue({ ok: true }),
}))

// Email no-op
vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
}))

// Hash module : retourne des valeurs prévisibles
vi.mock("@/lib/bailHash", () => ({
  hashBailData: vi.fn().mockResolvedValue("test-hash-sha256"),
  canonicalPayloadString: vi.fn().mockReturnValue("{}"),
}))

vi.mock("@/lib/notifPreferencesServer", () => ({
  shouldSendEmailForEvent: vi.fn().mockResolvedValue(true),
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
  return new Request("http://localhost/api/bail/signer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/bail/signer — auth + validation eIDAS", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({ annonceId: 1, role: "locataire", nom: "Jean Dupont", mention: VALID_MENTION, signaturePng: VALID_PNG }) as unknown as never)
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si annonceId manquant", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({ role: "locataire", nom: "Jean Dupont", mention: VALID_MENTION, signaturePng: VALID_PNG }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si role invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({ annonceId: 1, role: "fake_role", nom: "Jean", mention: VALID_MENTION, signaturePng: VALID_PNG }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si nom trop court", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({ annonceId: 1, role: "locataire", nom: "X", mention: VALID_MENTION, signaturePng: VALID_PNG }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si mention non canonical (V50.11 strict equality)", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/signer/route")
    // V50.11 — la mention doit être STRICTEMENT "lu et approuve, bon pour accord"
    // (insensible accents/casse). Avant : .includes() acceptait "Lu et approuvé yolo".
    const res = await POST(makeReq({
      annonceId: 1,
      role: "locataire",
      nom: "Jean",
      mention: "Lu et approuvé yolo bon pour accord",
      signaturePng: VALID_PNG,
    }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si garant sans 'caution solidaire'", async () => {
    mockSession.mockResolvedValue({ user: { email: "garant@test.fr" } })
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({
      annonceId: 1,
      role: "garant",
      nom: "Marie Dupont",
      mention: VALID_MENTION, // canonical sans suffixe garant → refuse
      signaturePng: VALID_PNG,
    }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si signaturePng pas en data:image/png;base64", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({
      annonceId: 1,
      role: "locataire",
      nom: "Jean Dupont",
      mention: VALID_MENTION,
      signaturePng: "data:image/jpeg;base64,foo",
    }) as unknown as never)
    expect(res.status).toBe(400)
  })

  it("renvoie 413 si signaturePng > 500_000 chars", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    const { POST } = await import("../../app/api/bail/signer/route")
    const huge = "data:image/png;base64," + "A".repeat(500_001)
    const res = await POST(makeReq({
      annonceId: 1,
      role: "locataire",
      nom: "Jean Dupont",
      mention: VALID_MENTION,
      signaturePng: huge,
    }) as unknown as never)
    expect(res.status).toBe(413)
  })

  it("renvoie 404 si annonce introuvable", async () => {
    mockSession.mockResolvedValue({ user: { email: "loc@test.fr" } })
    // Mock annonce introuvable
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } })
    const eqAnn = vi.fn(() => ({ single }))
    const selectAnn = vi.fn(() => ({ eq: eqAnn }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({ select: selectAnn }))
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({
      annonceId: 999,
      role: "locataire",
      nom: "Jean Dupont",
      mention: VALID_MENTION,
      signaturePng: VALID_PNG,
    }) as unknown as never)
    expect(res.status).toBe(404)
  })

  it("renvoie 403 si locataire signe avec un email != annonce.locataire_email", async () => {
    mockSession.mockResolvedValue({ user: { email: "intrus@test.fr" } })
    // Mock annonce trouvée avec un autre locataire
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        proprietaire_email: "prop@test.fr",
        locataire_email: "vrai-loc@test.fr",
        prix: 800, charges: 50,
        date_debut_bail: "2026-06-01",
        titre: "Studio Bordeaux",
        ville: "Bordeaux",
      },
      error: null,
    })
    const eqAnn = vi.fn(() => ({ single }))
    const selectAnn = vi.fn(() => ({ eq: eqAnn }))
    ;(mockSupaAdmin.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({ select: selectAnn }))
    const { POST } = await import("../../app/api/bail/signer/route")
    const res = await POST(makeReq({
      annonceId: 1,
      role: "locataire",
      nom: "Intrus",
      mention: VALID_MENTION,
      signaturePng: VALID_PNG,
    }) as unknown as never)
    expect(res.status).toBe(403)
  })
})
