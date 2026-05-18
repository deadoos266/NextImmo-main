/**
 * V97.39.32 — Tests dispatcher email Brevo only.
 *
 * Vérifie :
 *  - getActiveEmailProvider() reflète BREVO_API_KEY présent
 *  - sendEmail() noop graceful si BREVO_API_KEY absent
 *  - sendEmail() appelle Brevo si configuré
 *  - sendEmailBrevo() construit le payload Brevo correctement
 *  - sendEmailBrevo() convertit tags KeyMatch → Brevo
 *  - sendEmailBrevo() respecte le guard self-email
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

describe("email dispatcher (lib/email/index.ts)", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.BREVO_API_KEY
    process.env.BREVO_FROM_EMAIL = "noreply@keymatch-immo.fr"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("getActiveEmailProvider sans clé → brevo not configured", async () => {
    const { getActiveEmailProvider } = await import("@/lib/email")
    const p = getActiveEmailProvider()
    expect(p.provider).toBe("brevo")
    expect(p.configured).toBe(false)
  })

  it("getActiveEmailProvider avec BREVO_API_KEY → configured", async () => {
    process.env.BREVO_API_KEY = "xkeysib-test"
    const { getActiveEmailProvider } = await import("@/lib/email")
    const p = getActiveEmailProvider()
    expect(p.provider).toBe("brevo")
    expect(p.configured).toBe(true)
  })

  it("sendEmail noop si BREVO_API_KEY absent (skipped=true)", async () => {
    const { sendEmail } = await import("@/lib/email")
    const res = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    })
    expect(res).toMatchObject({ ok: false, skipped: true })
  })

  it("sendEmail appelle Brevo si configuré (fetch sur api.brevo.com)", async () => {
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
    const headers = (call[1] as RequestInit).headers as Record<string, string>
    expect(headers["api-key"]).toBe("xkeysib-test")
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
