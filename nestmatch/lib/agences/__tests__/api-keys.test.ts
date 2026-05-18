/**
 * V97.39.34 — Tests api-keys helpers
 *
 * Couvre la génération, format, hash, scopes, extraction header.
 * Ne couvre pas verifyApiKey() qui nécessite un mock Supabase (couvert
 * en intégration plus loin).
 */

import { describe, it, expect } from "vitest"
import bcrypt from "bcryptjs"
import { generateApiKey, hasScope, extractApiKey } from "../api-keys"

describe("generateApiKey", () => {
  it("retourne un objet { fullKey, keyPrefix, keyHash }", async () => {
    const k = await generateApiKey()
    expect(k).toHaveProperty("fullKey")
    expect(k).toHaveProperty("keyPrefix")
    expect(k).toHaveProperty("keyHash")
  })

  it("fullKey commence par km_live_ et fait 40 chars (8 prefix + 32 hex)", async () => {
    const { fullKey } = await generateApiKey()
    expect(fullKey).toMatch(/^km_live_[a-f0-9]{32}$/)
    expect(fullKey.length).toBe(40)
  })

  it("keyPrefix = km_live_ + 8 premiers chars hex", async () => {
    const { fullKey, keyPrefix } = await generateApiKey()
    expect(keyPrefix).toBe(fullKey.substring(0, 16))
    expect(keyPrefix.length).toBe(16)
  })

  it("keyHash est un bcrypt valide", async () => {
    const { fullKey, keyHash } = await generateApiKey()
    // bcrypt hash commence par $2a$ ou $2b$ etc., 60 chars
    expect(keyHash).toMatch(/^\$2[abxy]\$\d+\$/)
    expect(keyHash.length).toBeGreaterThanOrEqual(60)
    // Et il match bien la clé en clair
    expect(await bcrypt.compare(fullKey, keyHash)).toBe(true)
  })

  it("génère des clés uniques (entropie 128 bits)", async () => {
    const k1 = await generateApiKey()
    const k2 = await generateApiKey()
    expect(k1.fullKey).not.toBe(k2.fullKey)
    expect(k1.keyPrefix).not.toBe(k2.keyPrefix)
  })
})

describe("hasScope", () => {
  const baseKey = {
    id: "1", agence_id: "a", label: "test", key_prefix: "km_live_xxx",
    scopes: ["annonces:read", "annonces:write"],
    created_by: "test@x.fr", created_at: "2026-05-18T00:00:00Z",
    last_used_at: null, last_used_ip: null, revoked_at: null,
    agenceStatut: "active", agenceName: "Test Agency",
  }

  it("retourne false si key null", () => {
    expect(hasScope(null, "annonces:read")).toBe(false)
  })

  it("retourne true si scope présent", () => {
    expect(hasScope(baseKey, "annonces:read")).toBe(true)
    expect(hasScope(baseKey, "annonces:write")).toBe(true)
  })

  it("retourne false si scope absent", () => {
    expect(hasScope(baseKey, "candidatures:read")).toBe(false)
    expect(hasScope(baseKey, "annonces:admin")).toBe(false)
  })

  it("retourne false si scopes vide", () => {
    expect(hasScope({ ...baseKey, scopes: [] }, "annonces:read")).toBe(false)
  })
})

describe("extractApiKey", () => {
  function makeReq(authHeader: string | null) {
    return {
      headers: {
        get(name: string) {
          const lower = name.toLowerCase()
          if (lower === "authorization") return authHeader
          return null
        },
      },
    }
  }

  it("extrait km_live_xxx du header Bearer", () => {
    const req = makeReq("Bearer km_live_abc123def456")
    expect(extractApiKey(req)).toBe("km_live_abc123def456")
  })

  it("accepte Bearer en lowercase", () => {
    const req = makeReq("bearer km_live_abc123def456")
    expect(extractApiKey(req)).toBe("km_live_abc123def456")
  })

  it("retourne null si pas de header", () => {
    expect(extractApiKey(makeReq(null))).toBe(null)
  })

  it("retourne null si format invalide", () => {
    expect(extractApiKey(makeReq("Basic abc:def"))).toBe(null)
    expect(extractApiKey(makeReq("Token xyz"))).toBe(null)
    expect(extractApiKey(makeReq("Bearer wrongprefix_xxx"))).toBe(null)
  })

  it("retourne null si clé contient caractères non-hex", () => {
    expect(extractApiKey(makeReq("Bearer km_live_NOT_HEX!"))).toBe(null)
  })
})
