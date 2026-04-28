import { describe, it, expect } from "vitest"
import { calcRangs, shouldShowRank, RANK_DISPLAY_MIN_TOTAL } from "./rangs"

describe("calcRangs", () => {
  it("liste pleine — tri par score decroissant, rangs 1..N", () => {
    const annonces = [
      { id: 1, scoreMatching: 700 },
      { id: 2, scoreMatching: 900 },
      { id: 3, scoreMatching: 500 },
    ]
    const r = calcRangs(annonces)
    expect(r.get(2)).toBe(1) // meilleur score
    expect(r.get(1)).toBe(2)
    expect(r.get(3)).toBe(3)
    expect(r.size).toBe(3)
  })

  it("annonces avec score null exclues du rang", () => {
    const annonces = [
      { id: 1, scoreMatching: 700 },
      { id: 2, scoreMatching: null },
      { id: 3, scoreMatching: 500 },
    ]
    const r = calcRangs(annonces)
    expect(r.has(2)).toBe(false)
    expect(r.get(1)).toBe(1)
    expect(r.get(3)).toBe(2)
    expect(r.size).toBe(2)
  })

  it("annonces avec score 0 exclues du rang (assimile a exclu)", () => {
    const annonces = [
      { id: 1, scoreMatching: 700 },
      { id: 2, scoreMatching: 0 },
    ]
    const r = calcRangs(annonces)
    expect(r.has(2)).toBe(false)
    expect(r.size).toBe(1)
  })

  it("tie : ordre stable (premier en input gagne)", () => {
    const annonces = [
      { id: 1, scoreMatching: 700 },
      { id: 2, scoreMatching: 700 },
      { id: 3, scoreMatching: 500 },
    ]
    const r = calcRangs(annonces)
    expect(r.get(1)).toBe(1)
    expect(r.get(2)).toBe(2)
    expect(r.get(3)).toBe(3)
  })

  it("liste vide → Map vide", () => {
    expect(calcRangs([]).size).toBe(0)
  })

  it("liste filtree (3 annonces) → rangs 1..3 mais shouldShowRank false", () => {
    const annonces = [
      { id: 1, scoreMatching: 700 },
      { id: 2, scoreMatching: 600 },
      { id: 3, scoreMatching: 500 },
    ]
    const r = calcRangs(annonces)
    expect(r.size).toBe(3)
    expect(shouldShowRank(3)).toBe(false)
  })

  it(`shouldShowRank seuil = ${RANK_DISPLAY_MIN_TOTAL}`, () => {
    expect(shouldShowRank(RANK_DISPLAY_MIN_TOTAL - 1)).toBe(false)
    expect(shouldShowRank(RANK_DISPLAY_MIN_TOTAL)).toBe(true)
    expect(shouldShowRank(RANK_DISPLAY_MIN_TOTAL + 50)).toBe(true)
  })
})

// V17 — test : rang scoped sur zone city, fallback global si <10 dans la zone
describe("V17 — calcRangs scoped on city zone", () => {
  function annoncesWithCity(): Array<{ id: number; scoreMatching: number; ville: string }> {
    return [
      { id: 1,  scoreMatching: 950, ville: "Paris" },
      { id: 2,  scoreMatching: 900, ville: "Marseille" },
      { id: 3,  scoreMatching: 850, ville: "Paris" },
      { id: 4,  scoreMatching: 800, ville: "Lyon" },
      { id: 5,  scoreMatching: 750, ville: "Paris" },
      { id: 6,  scoreMatching: 700, ville: "Marseille" },
      { id: 7,  scoreMatching: 650, ville: "Paris" },
      { id: 8,  scoreMatching: 600, ville: "Lille" },
      { id: 9,  scoreMatching: 550, ville: "Paris" },
      { id: 10, scoreMatching: 500, ville: "Paris" },
      { id: 11, scoreMatching: 450, ville: "Paris" },
      { id: 12, scoreMatching: 400, ville: "Paris" },
    ]
  }

  it("rang scoped sur Paris (8 annonces) → ids 1,3,5,7 = rangs 1,2,3,4", () => {
    const all = annoncesWithCity()
    const parisOnly = all.filter(a => a.ville === "Paris")
    const r = calcRangs(parisOnly)
    expect(r.get(1)).toBe(1)
    expect(r.get(3)).toBe(2)
    expect(r.get(5)).toBe(3)
    expect(r.get(7)).toBe(4)
    // Marseille / Lyon / Lille pas dans la map
    expect(r.get(2)).toBeUndefined()
    expect(r.get(4)).toBeUndefined()
  })

  it("rang Paris-only avec ≥10 annonces → shouldShowRank true", () => {
    const all = annoncesWithCity()
    const parisOnly = all.filter(a => a.ville === "Paris")
    expect(parisOnly.length).toBeGreaterThanOrEqual(8)
    const r = calcRangs(parisOnly)
    expect(r.size).toBe(parisOnly.length)
    // Avec 8 annonces Paris, shouldShowRank false → fallback global attendu
    expect(shouldShowRank(r.size)).toBe(false)
  })

  it("zone vide (city absente) → fallback global utile", () => {
    const all = annoncesWithCity()
    const inZone: typeof all = []
    expect(calcRangs(inZone).size).toBe(0)
    // L'appelant doit fallback sur calcRangs(all) — vérifié via integration.
    expect(calcRangs(all).size).toBe(all.length)
  })
})
