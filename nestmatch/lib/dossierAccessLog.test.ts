import { describe, it, expect, beforeEach } from "vitest"
import { hashToken, hashIP, parseUserAgent } from "./dossierAccessLog"

describe("hashToken", () => {
  it("est déterministe (même entrée = même sortie)", () => {
    const a = hashToken("abc")
    const b = hashToken("abc")
    expect(a).toBe(b)
  })

  it("produit une sortie de 16 caractères hex", () => {
    const h = hashToken("un-token-long")
    expect(h).toHaveLength(16)
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it("entrées différentes → sorties différentes", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"))
  })
})

describe("hashIP", () => {
  beforeEach(() => {
    process.env.DOSSIER_LOG_SALT = "test-salt-fixe"
  })

  it("est déterministe avec même salt", () => {
    expect(hashIP("127.0.0.1")).toBe(hashIP("127.0.0.1"))
  })

  it("produit 24 caractères hex", () => {
    const h = hashIP("192.168.1.1")
    expect(h).toHaveLength(24)
    expect(h).toMatch(/^[0-9a-f]{24}$/)
  })

  it("IPs différentes → hashes différents", () => {
    expect(hashIP("127.0.0.1")).not.toBe(hashIP("127.0.0.2"))
  })

  it("change si le salt change", () => {
    const h1 = hashIP("127.0.0.1")
    process.env.DOSSIER_LOG_SALT = "autre-salt"
    const h2 = hashIP("127.0.0.1")
    expect(h1).not.toBe(h2)
  })
})

describe("parseUserAgent", () => {
  it("reconnaît Chrome/Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    expect(parseUserAgent(ua)).toBe("Chrome / Windows")
  })

  it("reconnaît Safari/iOS", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
    expect(parseUserAgent(ua)).toBe("Safari / iOS")
  })

  it("reconnaît Firefox/Linux", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"
    expect(parseUserAgent(ua)).toBe("Firefox / Linux")
  })

  it("reconnaît Edge/Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
    expect(parseUserAgent(ua)).toBe("Edge / Windows")
  })

  it("reconnaît Chrome/macOS", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    expect(parseUserAgent(ua)).toBe("Chrome / macOS")
  })

  it("reconnaît Chrome/Android", () => {
    const ua = "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    expect(parseUserAgent(ua)).toBe("Chrome / Android")
  })

  it("renvoie 'Appareil inconnu' pour UA vide", () => {
    expect(parseUserAgent("")).toBe("Appareil inconnu")
  })

  it("fallback navigateur inconnu", () => {
    expect(parseUserAgent("BizarreBot/1.0")).toBe("Navigateur")
  })
})
