import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { joursRetardLoyer, labelRetard } from "./loyerHelpers"

describe("joursRetardLoyer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("renvoie 0 si confirmé", () => {
    vi.setSystemTime(new Date(2026, 3, 20)) // 20 avril 2026
    expect(joursRetardLoyer("2026-03", "confirmé")).toBe(0)
  })

  it("renvoie 0 si la date butoir n'est pas atteinte (avant le 10)", () => {
    vi.setSystemTime(new Date(2026, 3, 5)) // 5 avril
    expect(joursRetardLoyer("2026-04", "déclaré")).toBe(0)
  })

  it("calcule un retard positif après le 10 du mois courant", () => {
    vi.setSystemTime(new Date(2026, 3, 18, 12)) // 18 avril
    const retard = joursRetardLoyer("2026-04", "déclaré")
    expect(retard).toBeGreaterThan(0)
    expect(retard).toBeLessThanOrEqual(8)
  })

  it("marque un loyer d'un mois passé non confirmé comme en retard (>10 j)", () => {
    vi.setSystemTime(new Date(2026, 3, 1)) // 1 avril
    // mars non confirmé → écheance 10 mars, now 1 avril → ~21 j de retard
    const retard = joursRetardLoyer("2026-03", "déclaré")
    expect(retard).toBeGreaterThan(15)
  })

  it("renvoie 0 pour un mois invalide", () => {
    expect(joursRetardLoyer("invalid", "déclaré")).toBe(0)
    expect(joursRetardLoyer(null, "déclaré")).toBe(0)
    expect(joursRetardLoyer("", "déclaré")).toBe(0)
  })
})

describe("labelRetard", () => {
  it("renvoie chaîne vide si 0 ou négatif", () => {
    expect(labelRetard(0)).toBe("")
    expect(labelRetard(-3)).toBe("")
  })

  it("singulier à 1 jour", () => {
    expect(labelRetard(1)).toBe("En retard 1 j")
  })

  it("pluriel au-delà de 1", () => {
    expect(labelRetard(12)).toBe("En retard 12 j")
  })
})
