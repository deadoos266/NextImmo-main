import { describe, it, expect, beforeEach } from "vitest"
import { checkRateLimit, getClientIp } from "./rateLimit"

describe("checkRateLimit (mémoire process-local)", () => {
  beforeEach(() => {
    // S'assurer que le fallback mémoire est actif (pas d'Upstash configuré en test)
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it("autorise les N premières requêtes", () => {
    const key = `test-allow-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit(key, { max: 5, windowMs: 1000 })
      expect(r.allowed).toBe(true)
    }
  })

  it("refuse au-delà de max", () => {
    const key = `test-deny-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 5; i++) checkRateLimit(key, { max: 5, windowMs: 1000 })
    const r = checkRateLimit(key, { max: 5, windowMs: 1000 })
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSec).toBeGreaterThan(0)
    expect(r.remaining).toBe(0)
  })

  it("keys distinctes → compteurs indépendants", () => {
    const keyA = `test-A-${Date.now()}-${Math.random()}`
    const keyB = `test-B-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 3; i++) checkRateLimit(keyA, { max: 3, windowMs: 1000 })
    const rA = checkRateLimit(keyA, { max: 3, windowMs: 1000 })
    const rB = checkRateLimit(keyB, { max: 3, windowMs: 1000 })
    expect(rA.allowed).toBe(false)
    expect(rB.allowed).toBe(true)
  })

  it("retourne remaining correct", () => {
    const key = `test-remaining-${Date.now()}-${Math.random()}`
    const r1 = checkRateLimit(key, { max: 10, windowMs: 1000 })
    expect(r1.remaining).toBeGreaterThanOrEqual(0)
    expect(r1.remaining).toBeLessThanOrEqual(10)
  })
})

describe("getClientIp", () => {
  it("extrait IP depuis x-forwarded-for (premier élément si multiple)", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  it("utilise x-real-ip en fallback", () => {
    const h = new Headers({ "x-real-ip": "9.8.7.6" })
    expect(getClientIp(h)).toBe("9.8.7.6")
  })

  it("retourne 'unknown' si aucun header", () => {
    const h = new Headers()
    expect(getClientIp(h)).toBe("unknown")
  })

  it("priorité x-forwarded-for sur x-real-ip", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" })
    expect(getClientIp(h)).toBe("1.1.1.1")
  })
})
