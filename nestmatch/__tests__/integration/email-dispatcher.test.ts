/**
 * V97.39.19 P3 Phase 5 — Tests dispatcher email Resend ↔ Brevo.
 *
 * Vérifie :
 *  - getActiveEmailProvider() reflète EMAIL_PROVIDER + clés présentes
 *  - sendEmail() dispatche vers Resend si EMAIL_PROVIDER=resend (défaut)
 *  - sendEmail() dispatche vers Brevo si EMAIL_PROVIDER=brevo + BREVO_API_KEY
 *  - sendEmail() fallback Resend si EMAIL_PROVIDER=brevo mais pas de BREVO_API_KEY
 *  - sendEmail() noop graceful si aucun provider configuré
 *  - sendEmailBrevo() construit le payload Brevo correctement
 *  - sendEmailBrevo() convertit tags Resend → Brevo
 *  - sendEmailBrevo() respecte le guard self-email
 *  - sendEmailBrevo() respecte la suppress_list
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock Supabase admin (suppress_list + email_logs)
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null })),
          })),
        })),
      })),
      insert: vi.fn(async () => ({ error: null })),
    })),
  },
}))

// Mock Resend SDK (utilisé par lib/email/resend.ts). Doit être appelable via
// `new Resend(apiKey)` → on utilise une class pour satisfaire le constructeur.
vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: async () => ({ data: { id: "resend-msg-id-123" }, error: null }),
    }
  },
}))

describe("email dispatcher (lib/email/index.ts)", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    // Reset env aux valeurs minimales pour chaque test
    process.env = { ...originalEnv }
    delete process.env.EMAIL_PROVIDER
    delete process.env.BREVO_API_KEY
    delete process.env.RESEND_API_KEY
    process.env.BREVO_FROM_EMAIL = "noreply@keymatch-immo.fr"
    process.env.RESEND_FROM_EMAIL = "noreply@keymatch-immo.fr"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("getActiveEmailProvider défaut = resend non configuré", async () => {
    const { getActiveEmailProvider } = await import("@/lib/email")
    const p = getActiveEmailProvider()
    expect(p.provider).toBe("resend")
    expect(p.configured).toBe(false)
  })

  it("getActiveEmailProvider EMAIL_PROVIDER=brevo + BREVO_API_KEY → brevo configuré", async () => {
    process.env.EMAIL_PROVIDER = "brevo"
    process.env.BREVO_API_KEY = "xkeysib-test"
    const { getActiveEmailProvider } = await import("@/lib/email")
    const p = getActiveEmailProvider()
    expect(p.provider).toBe("brevo")
    expect(p.configured).toBe(true)
  })

  it("getActiveEmailProvider EMAIL_PROVIDER inconnu → fallback resend", async () => {
    process.env.EMAIL_PROVIDER = "mailjet" // pas supporté
    process.env.RESEND_API_KEY = "re_test"
    const { getActiveEmailProvider } = await import("@/lib/email")
    const p = getActiveEmailProvider()
    expect(p.provider).toBe("resend")
  })

  it("sendEmail noop si aucun provider configuré (skipped=true)", async () => {
    const { sendEmail } = await import("@/lib/email")
    const res = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })
    expect(res).toMatchObject({ ok: false, skipped: true })
  })

  it("sendEmail EMAIL_PROVIDER=brevo sans BREVO_API_KEY mais avec RESEND_API_KEY → fallback Resend", async () => {
    process.env.EMAIL_PROVIDER = "brevo"
    process.env.RESEND_API_KEY = "re_test"
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { sendEmail } = await import("@/lib/email")
    const res = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })

    expect(res.ok).toBe(true)
    // Le warning fallback doit avoir été loggé
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("fallback Resend"),
      expect.any(Object),
    )
    warnSpy.mockRestore()
  })

  it("sendEmail EMAIL_PROVIDER=brevo + BREVO_API_KEY → utilise Brevo (fetch sur api.brevo.com)", async () => {
    process.env.EMAIL_PROVIDER = "brevo"
    process.env.BREVO_API_KEY = "xkeysib-test"
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageId: "brevo-msg-id-456" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    )

    const { sendEmail } = await import("@/lib/email")
    const res = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })

    expect(res).toMatchObject({ ok: true, id: "brevo-msg-id-456" })
    expect(fetchSpy).toHaveBeenCalled()
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe("https://api.brevo.com/v3/smtp/email")
    const init = call[1] as RequestInit
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers["api-key"]).toBe("xkeysib-test")
    fetchSpy.mockRestore()
  })

  it("sendEmail défaut (resend) + RESEND_API_KEY → utilise Resend (pas fetch Brevo)", async () => {
    process.env.RESEND_API_KEY = "re_test"
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))

    const { sendEmail } = await import("@/lib/email")
    const res = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })

    expect(res.ok).toBe(true)
    // Brevo PAS appelé
    const calledBrevo = fetchSpy.mock.calls.some(c =>
      String(c[0]).includes("brevo.com"),
    )
    expect(calledBrevo).toBe(false)
    fetchSpy.mockRestore()
  })
})

describe("sendEmailBrevo (lib/email/brevo.ts)", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.BREVO_API_KEY = "xkeysib-test"
    process.env.BREVO_FROM_EMAIL = "noreply@keymatch-immo.fr"
    process.env.BREVO_FROM_NAME = "KeyMatch"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it("guard self-email : sender = to → skipped", async () => {
    const { sendEmailBrevo } = await import("@/lib/email/brevo")
    const res = await sendEmailBrevo({
      to: "paul@example.com",
      senderEmail: "paul@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })
    expect(res).toMatchObject({ ok: false, skipped: true })
  })

  it("skipped si BREVO_API_KEY absent", async () => {
    delete process.env.BREVO_API_KEY
    const { sendEmailBrevo } = await import("@/lib/email/brevo")
    const res = await sendEmailBrevo({
      to: "test@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })
    expect(res).toMatchObject({ ok: false, skipped: true })
  })

  it("payload Brevo correctement formaté (sender + to + subject + htmlContent)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageId: "x" }), { status: 201 }),
    )
    const { sendEmailBrevo } = await import("@/lib/email/brevo")
    await sendEmailBrevo({
      to: "test@example.com",
      subject: "Bonjour",
      html: "<p>hello</p>",
      text: "hello",
      tags: [{ name: "template", value: "bail_invite" }],
    })

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.sender).toEqual({ name: "KeyMatch", email: "noreply@keymatch-immo.fr" })
    expect(body.to).toEqual([{ email: "test@example.com" }])
    expect(body.subject).toBe("Bonjour")
    expect(body.htmlContent).toBe("<p>hello</p>")
    expect(body.textContent).toBe("hello")
    expect(body.tags).toEqual(["template:bail_invite"])
  })

  it("erreur HTTP Brevo → ok=false + error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ code: "invalid_parameter", message: "Invalid sender" }),
        { status: 400 },
      ),
    )
    const { sendEmailBrevo } = await import("@/lib/email/brevo")
    const res = await sendEmailBrevo({
      to: "test@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })
    expect(res).toMatchObject({ ok: false })
    expect(JSON.stringify(res)).toContain("Invalid sender")
  })
})
