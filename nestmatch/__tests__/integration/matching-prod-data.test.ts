// V6.4 (Paul 2026-04-28) — integration tests matching + screening avec
// donnees realistes (formes Supabase prod). Valide la chaine end-to-end :
// score sur 1000, exclusions filtres durs, breakdown, screening proprio.

import { describe, it, expect } from "vitest"
import { calculerScore, estExclu, type Annonce, type Profil } from "../../lib/matching"
import { computeScreening, type ScreeningProfil, type ScreeningAnnonceCriteria } from "../../lib/screening"

// Profil candidat type "Paul" — CDI Visale 3500€ Paris budget 1500€
const PAUL: Profil = {
  ville_souhaitee: "Paris",
  mode_localisation: "souple",
  budget_max: 1500,
  surface_min: 35,
  pieces_min: 2,
  meuble: true,
  parking: false,
  balcon: true,
  fibre: true,
  dpe_min: "C",
  dpe_min_actif: false,
  tolerance_budget_pct: 20,
  rayon_recherche_km: 15,
  preferences_equipements: { balcon: "souhaite", parking: "indifferent", fibre: "souhaite" },
  date_naissance: "1995-06-15",
  nb_occupants: 1,
  fumeur: false,
  animaux: false,
}

const PAUL_SCREENING: ScreeningProfil = {
  revenus_mensuels: 3500,
  situation_pro: "CDI",
  garant: true,
  type_garant: "Visale",
  prenom: "Paul",
  nom: "Martin",
  telephone: "0612345678",
  ville_souhaitee: "Paris",
  budget_max: 1500,
}

// 5 annonces realistes — V9.3 : qualite "premium" pour ne pas etre
// penalisees par le multiplicateur qualite (0.7-1.0). Stub des fields
// photos/description/... via Object.assign pour eviter de polluer
// l'interface Annonce (les fields sont lus dans `as any` cote matching).
function asAnnonce(base: Annonce): Annonce {
  return Object.assign(base as Record<string, unknown>, {
    photos: ["a","b","c","d","e","f"],
    description: "x".repeat(350),
    message_proprietaire: "Bel appartement…",
    localisation_exacte: true,
    chambres: 1,
  }) as Annonce
}
const T1_PARIS_800: Annonce = asAnnonce({
  ville: "Paris", prix: 800, surface: 25, pieces: 1, meuble: true,
  balcon: false, fibre: true, dpe: "D",
})
const T2_PARIS_1200: Annonce = asAnnonce({
  ville: "Paris", prix: 1200, surface: 45, pieces: 2, meuble: true, chambres: 1,
  balcon: true, fibre: true, dpe: "B",
})
const T3_PARIS_1800: Annonce = asAnnonce({
  ville: "Paris", prix: 1800, surface: 65, pieces: 3, meuble: false, chambres: 2,
  balcon: true, fibre: true, dpe: "C",
})
const T4_PARIS_2500: Annonce = asAnnonce({
  ville: "Paris", prix: 2500, surface: 90, pieces: 4, meuble: false, chambres: 3,
  balcon: true, fibre: true, dpe: "C",
})
const HOUSE_PARIS_3500: Annonce = asAnnonce({
  ville: "Paris", prix: 3500, surface: 130, pieces: 5, meuble: false, chambres: 4,
  balcon: true, jardin: true, fibre: true, dpe: "B",
})

describe("V6.4 matching integration — Paul vs 5 annonces realistes", () => {
  it("scores sont tous dans [0, 1000]", () => {
    const scores = [T1_PARIS_800, T2_PARIS_1200, T3_PARIS_1800, T4_PARIS_2500, HOUSE_PARIS_3500]
      .map(a => calculerScore(a, PAUL))
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1000)
    }
  })

  it("T2 Paris 1200€ (dans budget, pieces=2, meuble) → score eleve >= 600", () => {
    const score = calculerScore(T2_PARIS_1200, PAUL)
    expect(score).toBeGreaterThanOrEqual(600)
  })

  it("T1 Paris 800€ — sous budget mais 1 seule piece → score moyen", () => {
    const score = calculerScore(T1_PARIS_800, PAUL)
    expect(score).toBeGreaterThanOrEqual(400)
    expect(score).toBeLessThan(900)
  })

  it("T4 Paris 2500€ (66% au-dela du budget, tolerance 20%) → exclu", () => {
    expect(estExclu(T4_PARIS_2500, PAUL)).toBe(true)
  })

  it("T3 Paris 1800€ (20% au-dela du budget, dans tolerance) → pas exclu", () => {
    expect(estExclu(T3_PARIS_1800, PAUL)).toBe(false)
  })

  it("Tolerance abaissee a 5% → T3 (20% au-dela) devient exclu", () => {
    const paulStrict: Profil = { ...PAUL, tolerance_budget_pct: 5 }
    expect(estExclu(T3_PARIS_1800, paulStrict)).toBe(true)
  })

  it("DPE F + dpe_min C actif → exclu", () => {
    const paulStrictDpe: Profil = { ...PAUL, dpe_min_actif: true }
    const annonceFpie: Annonce = { ...T2_PARIS_1200, dpe: "F" }
    expect(estExclu(annonceFpie, paulStrictDpe)).toBe(true)
  })

  it("DPE F + dpe_min C INACTIF → pas exclu (juste score reduit)", () => {
    const paul: Profil = { ...PAUL, dpe_min_actif: false }
    const annonceF: Annonce = { ...T2_PARIS_1200, dpe: "F" }
    expect(estExclu(annonceF, paul)).toBe(false)
    const scoreF = calculerScore(annonceF, paul)
    const scoreB = calculerScore(T2_PARIS_1200, paul)
    expect(scoreF).toBeLessThan(scoreB)
  })

  it("Animaux refusee proprio + locataire avec animaux → exclu (filtre dur)", () => {
    const paulAnimal: Profil = { ...PAUL, animaux: true }
    const annonceNoAnimal: Annonce = { ...T2_PARIS_1200, animaux: false, animaux_politique: "non" }
    expect(estExclu(annonceNoAnimal, paulAnimal)).toBe(true)
  })

  it("profil vide (objet {}) → score neutre autour de 500", () => {
    const score = calculerScore(T2_PARIS_1200, {} as Profil)
    expect(score).toBeGreaterThanOrEqual(450)
    expect(score).toBeLessThanOrEqual(600)
  })

  it("equipement Indispensable + match → +X pts vs Indifferent", () => {
    const paulIndisp: Profil = { ...PAUL, preferences_equipements: { balcon: "indispensable" } }
    const paulIndiff: Profil = { ...PAUL, preferences_equipements: { balcon: "indifferent" } }
    const scoreIndisp = calculerScore(T2_PARIS_1200, paulIndisp)
    const scoreIndiff = calculerScore(T2_PARIS_1200, paulIndiff)
    expect(scoreIndisp).toBeGreaterThan(scoreIndiff)
  })
})

describe("V6.4 screening integration — Paul + critères proprio", () => {
  it("min_revenus_ratio 4 + Paul 3500€ pour loyer 1000€ → tendus (ratio 3.5)", () => {
    const annonce: ScreeningAnnonceCriteria = {
      min_revenus_ratio: 4,
      garants_acceptes: [],
      profils_acceptes: [],
    }
    const r = computeScreening(PAUL_SCREENING, 1000, annonce)
    expect(r.flags.some(f => /tendus|4\.0×/i.test(f))).toBe(true)
  })

  it("min_revenus_ratio 2.5 + Paul 3500€ pour loyer 1000€ → screening pass", () => {
    const annonce: ScreeningAnnonceCriteria = {
      min_revenus_ratio: 2.5,
      garants_acceptes: [],
      profils_acceptes: [],
    }
    const r = computeScreening(PAUL_SCREENING, 1000, annonce)
    expect(r.flags.every(f => !/tendus/i.test(f))).toBe(true)
  })

  it("garants_acceptes ['Visale'] + Paul garant Visale → pass", () => {
    const annonce: ScreeningAnnonceCriteria = {
      garants_acceptes: ["Visale"],
    }
    const r = computeScreening(PAUL_SCREENING, 1000, annonce)
    expect(r.flags.every(f => !/non listé/i.test(f))).toBe(true)
  })

  it("garants_acceptes ['Visale'] + locataire garant Parents → flag", () => {
    const paulParents: ScreeningProfil = { ...PAUL_SCREENING, type_garant: "Parents" }
    const annonce: ScreeningAnnonceCriteria = {
      garants_acceptes: ["Visale"],
    }
    const r = computeScreening(paulParents, 1000, annonce)
    expect(r.flags.some(f => /non listé/i.test(f))).toBe(true)
  })

  it("garants_acceptes [] + locataire garant Parents → pass (vide = tous acceptes)", () => {
    const paulParents: ScreeningProfil = { ...PAUL_SCREENING, type_garant: "Parents" }
    const annonce: ScreeningAnnonceCriteria = {
      garants_acceptes: [],
    }
    const r = computeScreening(paulParents, 1000, annonce)
    expect(r.flags.every(f => !/non listé/i.test(f))).toBe(true)
  })

  it("profils_acceptes ['CDI'] + locataire Etudiant → flag", () => {
    const paulEtudiant: ScreeningProfil = { ...PAUL_SCREENING, situation_pro: "Étudiant" }
    const annonce: ScreeningAnnonceCriteria = {
      profils_acceptes: ["CDI"],
    }
    const r = computeScreening(paulEtudiant, 1000, annonce)
    expect(r.flags.some(f => /non listé/i.test(f))).toBe(true)
  })

  it("annonce default (DB shape) + Paul → screening tier non-incomplet", () => {
    const annonce: ScreeningAnnonceCriteria = {
      min_revenus_ratio: 3.0,
      garants_acceptes: [],
      profils_acceptes: [],
    }
    const r = computeScreening(PAUL_SCREENING, 1200, annonce)
    expect(r.tier).not.toBe("incomplet")
  })
})
