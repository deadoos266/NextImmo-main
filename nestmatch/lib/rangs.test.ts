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
