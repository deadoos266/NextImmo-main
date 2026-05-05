// V66.3 — tests lib/logger.

import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("createLogger", () => {
  it("emit JSON one-line avec ts, level, msg, request_id", async () => {
    const { createLogger } = await import("../../lib/logger")
    const log = createLogger({ route: "/api/test" })
    log.info("hello", { foo: 42 })
    expect(console.log).toHaveBeenCalledTimes(1)
    const line = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.level).toBe("info")
    expect(parsed.msg).toBe("hello")
    expect(parsed.route).toBe("/api/test")
    expect(parsed.foo).toBe(42)
    expect(typeof parsed.request_id).toBe("string")
    expect(parsed.request_id.length).toBeGreaterThan(10)
    expect(typeof parsed.ts).toBe("string")
  })

  it("bind ajoute des fields persistants", async () => {
    const { createLogger } = await import("../../lib/logger")
    const log = createLogger({ route: "/x" })
    log.bind({ user_email: "foo@bar.fr" })
    log.info("first")
    log.info("second", { extra: 1 })
    const line1 = JSON.parse((console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    const line2 = JSON.parse((console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0] as string)
    expect(line1.user_email).toBe("foo@bar.fr")
    expect(line2.user_email).toBe("foo@bar.fr")
    expect(line2.extra).toBe(1)
  })

  it("error emet via console.error", async () => {
    const { createLogger } = await import("../../lib/logger")
    const log = createLogger({ route: "/e" })
    log.error("boom", { code: 500 })
    expect(console.error).toHaveBeenCalledTimes(1)
    const line = JSON.parse((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(line.level).toBe("error")
    expect(line.code).toBe(500)
  })

  it("done emet duration_ms + status_code", async () => {
    const { createLogger } = await import("../../lib/logger")
    const log = createLogger({ route: "/d" })
    log.done(200)
    const line = JSON.parse((console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(line.msg).toBe("request done")
    expect(line.status_code).toBe(200)
    expect(typeof line.duration_ms).toBe("number")
    expect(line.duration_ms).toBeGreaterThanOrEqual(0)
  })
})
