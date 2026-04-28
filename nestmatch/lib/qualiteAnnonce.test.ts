import { describe, it, expect } from "vitest"
import { computeQualiteAnnonce, qualiteFacteur, QUALITE_TOTAL } from "./qualiteAnnonce"

describe("computeQualiteAnnonce", () => {
  it("annonce parfaite — score 100 + tier premium", () => {
    const r = computeQualiteAnnonce({
      photos: ["a","b","c","d","e","f"],
      description: "x".repeat(350),
      message_proprietaire: "Bonjour, voici mon bien…",
      dpe: "B",
      localisation_exacte: true,
      chambres: 2, pieces: 3, surface: 60,
    })
    expect(r.score).toBe(100)
    expect(r.tier).toBe("premium")
    expect(r.label).toBe("Annonce premium")
    expect(r.suggestions.length).toBe(0)
  })

  it("annonce minimale (1 photo, desc courte) — score faible + tier incomplete", () => {
    const r = computeQualiteAnnonce({
      photos: ["a"],
      description: "T2 Paris",
      dpe: "F",
    })
    expect(r.score).toBeLessThan(40)
    expect(r.tier).toBe("incomplete")
    expect(r.suggestions.length).toBeGreaterThanOrEqual(4)
  })

  it("seulement description longue — desc 20 pts", () => {
    const r = computeQualiteAnnonce({
      description: "x".repeat(400),
    })
    expect(r.parts.find(p => p.key === "description")?.pts).toBe(20)
  })

  it("description 80-300 chars → 10 pts", () => {
    const r = computeQualiteAnnonce({ description: "x".repeat(150) })
    expect(r.parts.find(p => p.key === "description")?.pts).toBe(10)
  })

  it("DPE F/G ou non renseigne → 0 pts", () => {
    expect(computeQualiteAnnonce({ dpe: "F" }).parts.find(p => p.key === "dpe")?.pts).toBe(0)
    expect(computeQualiteAnnonce({ dpe: "G" }).parts.find(p => p.key === "dpe")?.pts).toBe(0)
    expect(computeQualiteAnnonce({ dpe: "Non renseigné" }).parts.find(p => p.key === "dpe")?.pts).toBe(0)
    expect(computeQualiteAnnonce({}).parts.find(p => p.key === "dpe")?.pts).toBe(0)
  })

  it("DPE E → 5 pts", () => {
    expect(computeQualiteAnnonce({ dpe: "E" }).parts.find(p => p.key === "dpe")?.pts).toBe(5)
  })

  it("DPE A-D → 15 pts", () => {
    expect(computeQualiteAnnonce({ dpe: "A" }).parts.find(p => p.key === "dpe")?.pts).toBe(15)
    expect(computeQualiteAnnonce({ dpe: "D" }).parts.find(p => p.key === "dpe")?.pts).toBe(15)
  })

  it("photos 6+ → 30, 3-5 → 15, 1-2 → 5, 0 → 0", () => {
    expect(computeQualiteAnnonce({ photos: ["a","b","c","d","e","f"] }).parts.find(p => p.key === "photos")?.pts).toBe(30)
    expect(computeQualiteAnnonce({ photos: ["a","b","c"] }).parts.find(p => p.key === "photos")?.pts).toBe(15)
    expect(computeQualiteAnnonce({ photos: ["a"] }).parts.find(p => p.key === "photos")?.pts).toBe(5)
    expect(computeQualiteAnnonce({ photos: [] }).parts.find(p => p.key === "photos")?.pts).toBe(0)
    expect(computeQualiteAnnonce({}).parts.find(p => p.key === "photos")?.pts).toBe(0)
  })

  it("caracteristiques completes (chambres+pieces+surface) → 10 pts", () => {
    const ok = computeQualiteAnnonce({ chambres: 2, pieces: 3, surface: 60 })
    expect(ok.parts.find(p => p.key === "caracteristiques")?.pts).toBe(10)
    const partial = computeQualiteAnnonce({ chambres: 2, pieces: 3 })
    expect(partial.parts.find(p => p.key === "caracteristiques")?.pts).toBe(0)
  })

  it("suggestions ordonnees par impact decroissant", () => {
    const r = computeQualiteAnnonce({
      photos: [],
      description: "court",
      dpe: "F",
    })
    // Photos suggestion premiere (15 ou 30 pts), DPE/Mot/Loc apres
    const top = r.suggestions[0]
    expect(top.deltaPts).toBeGreaterThanOrEqual(r.suggestions[r.suggestions.length - 1].deltaPts)
  })
})

describe("qualiteFacteur", () => {
  it("score 0 → 0.7 (max malus -30%)", () => {
    expect(qualiteFacteur(0)).toBe(0.7)
  })
  it("score 100 → 1.0 (pas de malus)", () => {
    expect(qualiteFacteur(100)).toBe(1.0)
  })
  it("score 50 → 0.85 (mid)", () => {
    expect(qualiteFacteur(50)).toBeCloseTo(0.85, 5)
  })
  it("score < 0 ou > 100 clampe", () => {
    expect(qualiteFacteur(-10)).toBe(0.7)
    expect(qualiteFacteur(200)).toBe(1.0)
  })
})

describe("QUALITE_TOTAL constante", () => {
  it("somme des max = 100", () => {
    expect(QUALITE_TOTAL).toBe(100)
  })
})
