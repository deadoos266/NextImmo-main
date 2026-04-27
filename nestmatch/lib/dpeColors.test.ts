import { describe, it, expect } from "vitest"
import { dpeColorFor, dpeDescription, dpeEnergyCost, DPE_COLORS } from "./dpeColors"

describe("dpeColorFor", () => {
  it("retourne la couleur ADEME pour A-G", () => {
    for (const letter of ["A", "B", "C", "D", "E", "F", "G"] as const) {
      expect(dpeColorFor(letter)).toBe(DPE_COLORS[letter])
    }
  })

  it("est case-insensitive", () => {
    expect(dpeColorFor("a")).toBe(DPE_COLORS.A)
    expect(dpeColorFor("g")).toBe(DPE_COLORS.G)
  })

  it("fallback gris sur valeur inconnue", () => {
    expect(dpeColorFor("Z")).toBe("#8a8477")
    expect(dpeColorFor("")).toBe("#8a8477")
    expect(dpeColorFor(null)).toBe("#8a8477")
    expect(dpeColorFor(undefined)).toBe("#8a8477")
  })
})

describe("dpeDescription", () => {
  it("retourne la fourchette kWh + qualificatif pour chaque classe", () => {
    expect(dpeDescription("A")).toMatch(/0–50 kWh\/m²\/an/)
    expect(dpeDescription("A")).toMatch(/Excellent/)
    expect(dpeDescription("D")).toMatch(/151–230 kWh\/m²\/an/)
    expect(dpeDescription("F")).toMatch(/331–450/)
    // G a un format spécial "> 450" car la borne max est artificielle
    expect(dpeDescription("G")).toMatch(/> 450 kWh\/m²\/an/)
    expect(dpeDescription("G")).toMatch(/passoire thermique/)
  })

  it("est case-insensitive", () => {
    expect(dpeDescription("c")).toEqual(dpeDescription("C"))
  })

  it("retourne null sur valeur inconnue", () => {
    expect(dpeDescription("Z")).toBeNull()
    expect(dpeDescription(null)).toBeNull()
    expect(dpeDescription(undefined)).toBeNull()
    expect(dpeDescription("")).toBeNull()
  })
})

describe("dpeEnergyCost", () => {
  it("calcule un coût croissant de A vers G pour une même surface", () => {
    const surface = 50
    const costs = ["A", "B", "C", "D", "E", "F", "G"].map(L => dpeEnergyCost(L, surface))
    // Tous définis et > 0
    for (const c of costs) {
      expect(c).not.toBeNull()
      expect(c!).toBeGreaterThan(0)
    }
    // Strictement croissant (G > F > E > D > C > B > A)
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]!).toBeGreaterThan(costs[i - 1]!)
    }
  })

  it("scale linéairement avec la surface", () => {
    const c50 = dpeEnergyCost("D", 50)
    const c100 = dpeEnergyCost("D", 100)
    expect(c100).not.toBeNull()
    expect(c50).not.toBeNull()
    // Tolérance d'arrondi 50€ (cf round 50 dans l'implementation)
    expect(c100!).toBeGreaterThanOrEqual(c50! * 2 - 100)
    expect(c100!).toBeLessThanOrEqual(c50! * 2 + 100)
  })

  it("arrondi à 50€ près", () => {
    const c = dpeEnergyCost("D", 50)
    expect(c! % 50).toBe(0)
  })

  it("retourne null sans surface ou sans lettre", () => {
    expect(dpeEnergyCost("A", null)).toBeNull()
    expect(dpeEnergyCost("A", 0)).toBeNull()
    expect(dpeEnergyCost("A", -10)).toBeNull()
    expect(dpeEnergyCost(null, 50)).toBeNull()
    expect(dpeEnergyCost("Z", 50)).toBeNull()
  })
})
