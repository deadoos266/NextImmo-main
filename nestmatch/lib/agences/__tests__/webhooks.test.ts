/**
 * V97.39.34 — Tests lib/agences/webhooks.ts
 *
 * Couvre signature HMAC, verify constant-time, retry backoff, shouldRetry.
 */

import { describe, it, expect } from "vitest"
import crypto from "crypto"
import {
  signPayload,
  verifySignature,
  retryBackoffMs,
  shouldRetry,
  WEBHOOK_EVENTS,
} from "../webhooks"

describe("signPayload", () => {
  it("retourne format sha256=<hex>", () => {
    const sig = signPayload("secret", '{"hello":"world"}')
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it("signature identique pour même secret + body", () => {
    const s1 = signPayload("s", "body")
    const s2 = signPayload("s", "body")
    expect(s1).toBe(s2)
  })

  it("signature différente si body change", () => {
    expect(signPayload("s", "a")).not.toBe(signPayload("s", "b"))
  })

  it("signature différente si secret change", () => {
    expect(signPayload("s1", "body")).not.toBe(signPayload("s2", "body"))
  })

  it("équivaut à HMAC SHA256 standard (cross-check Node crypto)", () => {
    const secret = "my-secret"
    const body = '{"event":"test"}'
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex")
    expect(signPayload(secret, body)).toBe(expected)
  })
})

describe("verifySignature", () => {
  const SECRET = "test-secret"
  const BODY = '{"event":"candidature.created","data":{"id":1}}'

  it("retourne true pour signature valide", () => {
    const sig = signPayload(SECRET, BODY)
    expect(verifySignature(SECRET, BODY, sig)).toBe(true)
  })

  it("retourne false pour signature corrompue", () => {
    const sig = signPayload(SECRET, BODY)
    const tampered = sig.replace(/.$/, "0")
    expect(verifySignature(SECRET, BODY, tampered)).toBe(false)
  })

  it("retourne false si body modifié", () => {
    const sig = signPayload(SECRET, BODY)
    expect(verifySignature(SECRET, '{"event":"changed"}', sig)).toBe(false)
  })

  it("retourne false si secret modifié", () => {
    const sig = signPayload(SECRET, BODY)
    expect(verifySignature("wrong-secret", BODY, sig)).toBe(false)
  })

  it("retourne false sur string vide", () => {
    expect(verifySignature(SECRET, BODY, "")).toBe(false)
  })

  it("retourne false sur signature de longueur différente", () => {
    expect(verifySignature(SECRET, BODY, "sha256=short")).toBe(false)
  })
})

describe("retryBackoffMs", () => {
  it("attempt 1 → 1 minute", () => {
    expect(retryBackoffMs(1)).toBe(60 * 1000)
  })

  it("attempt 2 → 5 minutes", () => {
    expect(retryBackoffMs(2)).toBe(5 * 60 * 1000)
  })

  it("attempt 3 → 30 minutes", () => {
    expect(retryBackoffMs(3)).toBe(30 * 60 * 1000)
  })

  it("attempt > 3 → 30 minutes (cap)", () => {
    expect(retryBackoffMs(99)).toBe(30 * 60 * 1000)
  })

  it("backoff croissant", () => {
    expect(retryBackoffMs(1)).toBeLessThan(retryBackoffMs(2))
    expect(retryBackoffMs(2)).toBeLessThan(retryBackoffMs(3))
  })
})

describe("shouldRetry", () => {
  it("status 2xx → false (success)", () => {
    expect(shouldRetry(200)).toBe(false)
    expect(shouldRetry(201)).toBe(false)
    expect(shouldRetry(204)).toBe(false)
  })

  it("status 0 (network error/timeout) → true", () => {
    expect(shouldRetry(0)).toBe(true)
  })

  it("status 4xx (sauf 408/429) → false (permanent)", () => {
    expect(shouldRetry(400)).toBe(false)
    expect(shouldRetry(401)).toBe(false)
    expect(shouldRetry(403)).toBe(false)
    expect(shouldRetry(404)).toBe(false)
    expect(shouldRetry(422)).toBe(false)
  })

  it("status 408 (timeout serveur agence) → true", () => {
    expect(shouldRetry(408)).toBe(true)
  })

  it("status 429 (rate limit agence) → true", () => {
    expect(shouldRetry(429)).toBe(true)
  })

  it("status 5xx → true", () => {
    expect(shouldRetry(500)).toBe(true)
    expect(shouldRetry(502)).toBe(true)
    expect(shouldRetry(503)).toBe(true)
    expect(shouldRetry(504)).toBe(true)
  })
})

describe("WEBHOOK_EVENTS", () => {
  it("contient au moins les 4 events MVP", () => {
    expect(WEBHOOK_EVENTS).toContain("candidature.created")
    expect(WEBHOOK_EVENTS).toContain("visite.confirmee")
    expect(WEBHOOK_EVENTS).toContain("bail.signed")
    expect(WEBHOOK_EVENTS).toContain("message.received")
  })

  it("format event = <ressource>.<action>", () => {
    for (const ev of WEBHOOK_EVENTS) {
      expect(ev).toMatch(/^[a-z]+\.[a-z_]+$/)
    }
  })
})
