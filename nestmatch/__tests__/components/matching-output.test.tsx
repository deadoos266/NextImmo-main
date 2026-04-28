// @vitest-environment jsdom
// V10.1 — sanity tests sur l'enchainement matching → ScoreBlock + breakdown.
// Ces tests valident que le code de scoring + UI render correctement
// pour des annonces realistes prod-shape.

import { describe, it, expect } from "vitest"
import { calculerScore, breakdownScore, suggestImprovements, estExclu } from "../../lib/matching"
import { calcRangsGlobal, shouldShowRank } from "../../lib/rangs"
import { computeQualiteAnnonce, qualiteFacteur } from "../../lib/qualiteAnnonce"
import { computeScreening } from "../../lib/screening"
import type { Annonce, Profil } from "../../lib/matching"

const PROFIL: Profil = {
  ville_souhaitee: "Paris",
  budget_max: 1500,
  surface_min: 40,
  pieces_min: 2,
  meuble: true,
  parking: true,
  fibre: true,
  dpe_min: "C",
  tolerance_budget_pct: 10,
  preferences_equipements: { parking: "indispensable", balcon: "souhaite" },
}

function makeAnnonce(overrides: Partial<Annonce> = {}): Annonce {
  // Annonce qualite premium pour ne pas être pénalisée par le multiplier V9.3
  const base = {
    ville: "Paris", prix: 1200, surface: 50, pieces: 3, chambres: 2,
    meuble: true, parking: true, balcon: true, fibre: true, dpe: "B",
    photos: ["a","b","c","d","e","f"],
    description: "x".repeat(350),
    message_proprietaire: "Bel appartement…",
    localisation_exacte: true,
  } as Record<string, unknown>
  return { ...base, ...overrides } as unknown as Annonce
}

describe("V10.1 — chaine matching end-to-end", () => {
  it("annonce qui match le profil ne doit pas être exclue", () => {
    const ann = makeAnnonce()
    expect(estExclu(ann, PROFIL)).toBe(false)
  })

  it("annonce sans parking + parking=Indispensable → exclu (V7.1)", () => {
    const ann = makeAnnonce({ parking: false })
    expect(estExclu(ann, PROFIL)).toBe(true)
  })

  it("calculerScore retourne entier dans [0,1000]", () => {
    const score = calculerScore(makeAnnonce(), PROFIL)
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1000)
  })

  it("breakdown retourne 6 categories", () => {
    const bd = breakdownScore(makeAnnonce(), PROFIL)
    expect(bd.length).toBe(6)
    expect(bd.map(b => b.key).sort()).toEqual(["budget", "dpe", "equipements", "meuble", "pieces", "surface"])
    for (const b of bd) {
      expect(b.pts).toBeGreaterThanOrEqual(0)
      expect(b.pts).toBeLessThanOrEqual(b.max)
    }
  })

  it("suggestImprovements ne crash pas et renvoie max 3 elements", () => {
    const sg = suggestImprovements(makeAnnonce({ prix: 2000 }), PROFIL)
    expect(sg.length).toBeLessThanOrEqual(3)
  })

  it("calcRangsGlobal trie correctement", () => {
    const annonces = [
      { id: 1, scoreMatching: 600 },
      { id: 2, scoreMatching: 900 },
      { id: 3, scoreMatching: 750 },
    ]
    const r = calcRangsGlobal(annonces)
    expect(r.get(2)).toBe(1)
    expect(r.get(3)).toBe(2)
    expect(r.get(1)).toBe(3)
  })

  it("shouldShowRank seuil 10", () => {
    expect(shouldShowRank(9)).toBe(false)
    expect(shouldShowRank(10)).toBe(true)
  })

  it("computeQualiteAnnonce sur annonce premium = 100", () => {
    const r = computeQualiteAnnonce({
      photos: ["1","2","3","4","5","6"],
      description: "x".repeat(400),
      message_proprietaire: "msg",
      dpe: "B",
      localisation_exacte: true,
      chambres: 2, pieces: 3, surface: 60,
    })
    expect(r.score).toBe(100)
    expect(r.tier).toBe("premium")
  })

  it("qualiteFacteur lineaire 0.7 → 1.0", () => {
    expect(qualiteFacteur(0)).toBe(0.7)
    expect(qualiteFacteur(100)).toBe(1.0)
  })

  it("computeScreening avec annonce DB shape (default 3.0)", () => {
    const r = computeScreening(
      { revenus_mensuels: 3500, situation_pro: "CDI", garant: true },
      1000,
      { min_revenus_ratio: 3.0, garants_acceptes: [], profils_acceptes: [] }
    )
    expect(r.tier).not.toBe("incomplet")
    expect(r.score).toBeGreaterThan(50)
  })
})
