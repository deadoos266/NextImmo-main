// V29.D (Paul 2026-04-29) — tests sécurité /api/profil/me + by-emails +
// candidat. Vérifie l'auth gating, l'anti-spoof, et la whitelist PUBLIC_COLS.

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: () => mockSession(),
}))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

// Capture le SELECT chain pour vérifier les colonnes demandées + filtrer
const captured = { cols: "" as string, table: "" as string }
const supaMock = {
  from: vi.fn((tbl: string) => {
    captured.table = tbl
    return {
      select: (cols: string) => {
        captured.cols = cols
        return {
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { email: "u@test.fr", dossier_docs: { cni: "X" } }, error: null }),
            single: () => Promise.resolve({ data: { email: "u@test.fr" }, error: null }),
          }),
          in: () => Promise.resolve({ data: [{ email: "u@test.fr" }], error: null }),
        }
      },
    }
  }),
}
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: supaMock }))

beforeEach(() => {
  mockSession.mockReset()
  captured.cols = ""
  captured.table = ""
})

function makeReq(url: string, init?: RequestInit) {
  // NextRequest a un getter `nextUrl`. On simule avec un objet qui a juste
  // ce dont les routes ont besoin (nextUrl + json()).
  if (init?.method === "POST") {
    return new Request(url, init) as unknown as never
  }
  return { nextUrl: new URL(url) } as unknown as never
}

describe("V29.D /api/profil/me — auth + cols whitelist", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { GET } = await import("../../app/api/profil/me/route")
    const res = await GET(makeReq("http://localhost/api/profil/me"))
    expect(res.status).toBe(401)
  })

  it("filtre les cols (anti-injection, regex column-name-safe)", async () => {
    mockSession.mockResolvedValue({ user: { email: "u@test.fr" } })
    const { GET } = await import("../../app/api/profil/me/route")
    await GET(makeReq("http://localhost/api/profil/me?cols=email,DROP TABLE users,prenom"))
    // "DROP TABLE users" rejeté par la regex (contient espace), mais email/prenom passés
    expect(captured.cols).not.toContain("DROP")
    expect(captured.cols).toContain("email")
    expect(captured.cols).toContain("prenom")
  })

  it("default cols=*", async () => {
    mockSession.mockResolvedValue({ user: { email: "u@test.fr" } })
    const { GET } = await import("../../app/api/profil/me/route")
    await GET(makeReq("http://localhost/api/profil/me"))
    expect(captured.cols).toBe("*")
  })
})

describe("V29.D /api/profil/by-emails — auth + PUBLIC_COLS whitelist", () => {
  function reqByEmails(body: unknown) {
    return makeReq("http://localhost/api/profil/by-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { POST } = await import("../../app/api/profil/by-emails/route")
    const res = await POST(reqByEmails({ emails: ["u@test.fr"] }))
    expect(res.status).toBe(401)
  })

  it("default cols = PUBLIC_COLS — exclut dossier_docs/revenus", async () => {
    mockSession.mockResolvedValue({ user: { email: "me@test.fr" } })
    const { POST } = await import("../../app/api/profil/by-emails/route")
    await POST(reqByEmails({ emails: ["target@test.fr"] }))
    expect(captured.cols).not.toContain("dossier_docs")
    expect(captured.cols).not.toContain("revenus_mensuels")
    expect(captured.cols).not.toContain("nb_enfants")
    // Mais bien email + prenom + photo
    expect(captured.cols).toContain("email")
    expect(captured.cols).toContain("prenom")
    expect(captured.cols).toContain("photo_url_custom")
  })

  it("attaque : cols custom contient dossier_docs → filtré par whitelist", async () => {
    mockSession.mockResolvedValue({ user: { email: "attacker@test.fr" } })
    const { POST } = await import("../../app/api/profil/by-emails/route")
    await POST(reqByEmails({ emails: ["victim@test.fr"], cols: ["dossier_docs", "revenus_mensuels", "email"] }))
    // dossier_docs et revenus_mensuels filtrés par whitelist, email passe
    expect(captured.cols).not.toContain("dossier_docs")
    expect(captured.cols).not.toContain("revenus_mensuels")
    expect(captured.cols).toContain("email")
  })

  it("emails invalides filtrés (regex)", async () => {
    mockSession.mockResolvedValue({ user: { email: "u@test.fr" } })
    const { POST } = await import("../../app/api/profil/by-emails/route")
    const res = await POST(reqByEmails({ emails: ["not-an-email", "broken@", "valid@test.fr"] }))
    expect(res.status).toBe(200)
    // Au moins valid@test.fr doit passer (mais on ne peut pas vérifier le call exact ici)
  })
})

describe("V29.D /api/profil/candidat/[email] — auth chain", () => {
  it("renvoie 401 sans session", async () => {
    mockSession.mockResolvedValue(null)
    const { GET } = await import("../../app/api/profil/candidat/[email]/route")
    const res = await GET(
      makeReq("http://localhost/api/profil/candidat/x@test.fr"),
      { params: Promise.resolve({ email: "x@test.fr" }) } as unknown as never,
    )
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si email invalide", async () => {
    mockSession.mockResolvedValue({ user: { email: "p@test.fr" } })
    const { GET } = await import("../../app/api/profil/candidat/[email]/route")
    const res = await GET(
      makeReq("http://localhost/api/profil/candidat/not-an-email"),
      { params: Promise.resolve({ email: "not-an-email" }) } as unknown as never,
    )
    expect(res.status).toBe(400)
  })

  it("renvoie 400 si self-read (anti-loop)", async () => {
    mockSession.mockResolvedValue({ user: { email: "p@test.fr" } })
    const { GET } = await import("../../app/api/profil/candidat/[email]/route")
    const res = await GET(
      makeReq("http://localhost/api/profil/candidat/p@test.fr"),
      { params: Promise.resolve({ email: "p@test.fr" }) } as unknown as never,
    )
    expect(res.status).toBe(400)
  })
})
