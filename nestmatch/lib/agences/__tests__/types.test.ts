/**
 * V97.39.34 — Tests helpers types agences
 */

import { describe, it, expect } from "vitest"
import {
  ROLE_RANK,
  userHasRoleInAgence,
  isValidSiret,
  isValidCarteT,
  generateSlug,
} from "../types"

describe("ROLE_RANK", () => {
  it("owner > admin > agent > viewer", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin)
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.agent)
    expect(ROLE_RANK.agent).toBeGreaterThan(ROLE_RANK.viewer)
  })
})

describe("userHasRoleInAgence", () => {
  const baseMember = {
    role: "agent" as const,
    joined_at: "2026-05-18T10:00:00Z",
    removed_at: null,
  }

  it("retourne false si membre null", () => {
    expect(userHasRoleInAgence(null, "viewer")).toBe(false)
    expect(userHasRoleInAgence(undefined, "viewer")).toBe(false)
  })

  it("retourne false si membre retiré", () => {
    expect(userHasRoleInAgence({ ...baseMember, removed_at: "2026-05-19T00:00:00Z" }, "viewer")).toBe(false)
  })

  it("retourne false si membre invité mais pas encore rejoint", () => {
    expect(userHasRoleInAgence({ ...baseMember, joined_at: null }, "viewer")).toBe(false)
  })

  it("retourne true si role >= minRole", () => {
    expect(userHasRoleInAgence({ ...baseMember, role: "owner" }, "viewer")).toBe(true)
    expect(userHasRoleInAgence({ ...baseMember, role: "owner" }, "owner")).toBe(true)
    expect(userHasRoleInAgence({ ...baseMember, role: "admin" }, "agent")).toBe(true)
    expect(userHasRoleInAgence({ ...baseMember, role: "agent" }, "agent")).toBe(true)
  })

  it("retourne false si role < minRole", () => {
    expect(userHasRoleInAgence({ ...baseMember, role: "viewer" }, "agent")).toBe(false)
    expect(userHasRoleInAgence({ ...baseMember, role: "agent" }, "admin")).toBe(false)
    expect(userHasRoleInAgence({ ...baseMember, role: "admin" }, "owner")).toBe(false)
  })
})

describe("isValidSiret", () => {
  it("accepte 14 chiffres", () => {
    expect(isValidSiret("44306184100047")).toBe(true)
    expect(isValidSiret("12345678901234")).toBe(true)
  })

  it("accepte avec espaces", () => {
    expect(isValidSiret("443 0618 410 0047")).toBe(true)
  })

  it("refuse si < 14 chiffres", () => {
    expect(isValidSiret("1234567890123")).toBe(false)
    expect(isValidSiret("")).toBe(false)
  })

  it("refuse si > 14 chiffres", () => {
    expect(isValidSiret("123456789012345")).toBe(false)
  })

  it("refuse si contient des lettres", () => {
    expect(isValidSiret("ABC06184100047")).toBe(false)
    expect(isValidSiret("44306184100A47")).toBe(false)
  })
})

describe("isValidCarteT", () => {
  it("accepte CPI + 12-16 chiffres", () => {
    expect(isValidCarteT("CPI 7501 2018 000 042 069")).toBe(true)
    expect(isValidCarteT("CPI7501201800004206")).toBe(true)
    expect(isValidCarteT("cpi 750120180000420")).toBe(true)
  })

  it("refuse si pas de préfixe CPI", () => {
    expect(isValidCarteT("7501 2018 000 042 069")).toBe(false)
    expect(isValidCarteT("CP 7501 2018 000")).toBe(false)
  })

  it("refuse si < 12 chiffres après CPI", () => {
    expect(isValidCarteT("CPI 123456")).toBe(false)
  })

  it("refuse string vide ou bricolage", () => {
    expect(isValidCarteT("")).toBe(false)
    expect(isValidCarteT("CPI")).toBe(false)
  })
})

describe("generateSlug", () => {
  it("convertit basique", () => {
    expect(generateSlug("Century 21 Bastille")).toBe("century-21-bastille")
  })

  it("retire les accents", () => {
    expect(generateSlug("Agence Étoile")).toBe("agence-etoile")
    expect(generateSlug("Immobilière des Marées")).toBe("immobiliere-des-marees")
  })

  it("retire les caractères spéciaux", () => {
    expect(generateSlug("Foncia & Associés!")).toBe("foncia-associes")
  })

  it("trim les tirets en début/fin", () => {
    expect(generateSlug("  -Paris-  ")).toBe("paris")
  })

  it("tronque à 50 chars", () => {
    const long = "a".repeat(80)
    expect(generateSlug(long).length).toBeLessThanOrEqual(50)
  })

  it("vide si juste des chars spéciaux", () => {
    expect(generateSlug("!@#$%")).toBe("")
  })
})
