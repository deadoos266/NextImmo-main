import { describe, it, expect } from "vitest"
import { computeScreening, type ScreeningProfil } from "./screening"

describe("computeScreening — tiers", () => {
  it("profil null → tier 'incomplet'", () => {
    const r = computeScreening(null, 1000)
    expect(r.tier).toBe("incomplet")
    expect(r.score).toBe(0)
    expect(r.flags).toContain("Dossier vide")
  })

  it("profil undefined → tier 'incomplet'", () => {
    const r = computeScreening(undefined, 1000)
    expect(r.tier).toBe("incomplet")
    expect(r.score).toBe(0)
  })

  it("profil très complet → tier 'excellent' (score ≥ 80)", () => {
    const p: ScreeningProfil = {
      revenus_mensuels: 3500,
      situation_pro: "CDI",
      garant: true,
      type_garant: "Parent",
      nom: "Dupont",
      telephone: "0600000000",
      ville_souhaitee: "Paris",
      budget_max: 1200,
      profil_locataire: "Jeune actif sérieux",
    }
    const r = computeScreening(p, 1000)
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.tier).toBe("excellent")
    expect(r.label).toBe("Excellent")
  })

  it("profil correct sans garant → tier 'bon' (60-79)", () => {
    // CDI(25) + solvabilité 3.5×(45) + garant=false(0) + completude partielle = ~70-78
    const p: ScreeningProfil = {
      revenus_mensuels: 3500,
      situation_pro: "CDI",
      garant: false,
      nom: "Martin",
      telephone: "0600000000",
      ville_souhaitee: "Lyon",
      // budget_max & profil_locataire manquants → completude incomplète
    }
    const r = computeScreening(p, 1000)
    expect(r.score).toBeGreaterThanOrEqual(60)
    expect(r.score).toBeLessThan(80)
    expect(r.tier).toBe("bon")
  })

  it("CDD sans garant avec revenus 2.5× → tier 'moyen' (40-59)", () => {
    const p: ScreeningProfil = {
      revenus_mensuels: 2500,
      situation_pro: "CDD",
      garant: false,
      nom: "Durand",
      telephone: "0600000000",
    }
    const r = computeScreening(p, 1000)
    expect(r.score).toBeGreaterThanOrEqual(40)
    expect(r.score).toBeLessThan(60)
    expect(r.tier).toBe("moyen")
  })

  it("Étudiant avec revenus insuffisants → tier 'faible' (20-39)", () => {
    // Étudiant(10) + ratio 1.5×(5) + garant=false(0) + completude(~8) = ~23
    const p: ScreeningProfil = {
      revenus_mensuels: 1500,
      situation_pro: "Étudiant",
      garant: false,
      nom: "Alex",
      telephone: "0600000000",
      ville_souhaitee: "Paris",
      budget_max: 600,
    }
    const r = computeScreening(p, 1000)
    expect(r.score).toBeGreaterThanOrEqual(20)
    expect(r.score).toBeLessThan(40)
    expect(r.tier).toBe("faible")
  })

  it("revenus_mensuels null → pas de crash, tier faible/incomplet, flag revenus non renseignés", () => {
    const p: ScreeningProfil = {
      revenus_mensuels: null,
      situation_pro: "CDI",
      garant: false,
    }
    const r = computeScreening(p, 1000)
    expect(r).toBeDefined()
    expect(r.ratioSolvabilite).toBeNull()
    expect(r.flags).toContain("Revenus non renseignés")
  })

  it("profil quasi vide → tier 'incomplet' (score < 20)", () => {
    const p: ScreeningProfil = {}
    const r = computeScreening(p, 1000)
    // Score minimal : situation_pro manque (0), garant manque (0), completude 0, solvabilite 0
    // Donc on devrait tomber en incomplet
    expect(r.score).toBeLessThan(20)
    expect(r.tier).toBe("incomplet")
  })
})

describe("computeScreening — solvabilité (règle 33%)", () => {
  it("ratio ≥ 3× loyer → 45 pts solvabilité (excellent)", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", garant: true }
    const r = computeScreening(p, 1000) // ratio = 3.0
    expect(r.ratioSolvabilite).toBeCloseTo(3, 5)
    expect(r.flags.some(f => f.includes("insuffisants"))).toBe(false)
  })

  it("ratio 2.5-2.99× → pénalité (flag proprio attend 3×)", () => {
    const p: ScreeningProfil = { revenus_mensuels: 2700, situation_pro: "CDI", garant: true }
    const r = computeScreening(p, 1000) // ratio = 2.7
    expect(r.flags.some(f => /proprio attend 3\.0×/i.test(f))).toBe(true)
  })

  it("ratio < 2× → flag 'Revenus insuffisants'", () => {
    const p: ScreeningProfil = { revenus_mensuels: 1500, situation_pro: "CDI", garant: true }
    const r = computeScreening(p, 1000) // ratio = 1.5
    expect(r.flags.some(f => f.includes("Revenus insuffisants"))).toBe(true)
  })
})

describe("computeScreening — garant", () => {
  it("Garant présent → bonus +20 pts + label 'Garant' dans summary", () => {
    const avec: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", garant: true }
    const sans: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", garant: false }
    const rAvec = computeScreening(avec, 1000)
    const rSans = computeScreening(sans, 1000)
    expect(rAvec.score - rSans.score).toBe(20)
    expect(rAvec.summary).toContain("Garant")
  })

  it("Garant absent → flag 'Pas de garant'", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", garant: false }
    const r = computeScreening(p, 1000)
    expect(r.flags).toContain("Pas de garant")
  })

  it("Garant non renseigné → flag 'Garant non renseigné'", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI" }
    const r = computeScreening(p, 1000)
    expect(r.flags).toContain("Garant non renseigné")
  })
})

describe("computeScreening — situation professionnelle", () => {
  const base = { revenus_mensuels: 3000, garant: true, nom: "X", telephone: "0600" } as ScreeningProfil
  const loyer = 1000

  it("CDI > CDD > Indépendant > Étudiant (ordre des scores)", () => {
    const cdi = computeScreening({ ...base, situation_pro: "CDI" }, loyer).score
    const cdd = computeScreening({ ...base, situation_pro: "CDD" }, loyer).score
    const indep = computeScreening({ ...base, situation_pro: "Indépendant" }, loyer).score
    const etu = computeScreening({ ...base, situation_pro: "Étudiant" }, loyer).score

    expect(cdi).toBeGreaterThan(cdd)
    // CDD et Indépendant sont dans le même tier SITUATION_PRO_MOYENNE → même score
    expect(cdd).toBe(indep)
    expect(indep).toBeGreaterThan(etu)
  })

  it("CDI = 25 pts, CDD = 15 pts, Étudiant = 10 pts pour la dimension situation", () => {
    const cdi = computeScreening({ ...base, situation_pro: "CDI" }, loyer).score
    const cdd = computeScreening({ ...base, situation_pro: "CDD" }, loyer).score
    const etu = computeScreening({ ...base, situation_pro: "Étudiant" }, loyer).score
    expect(cdi - cdd).toBe(10) // 25 - 15
    expect(cdd - etu).toBe(5)  // 15 - 10
  })
})

// Régression batch 34 : le flag garant peut être dérivé de type_garant
describe("computeScreening — garant dérivé de type_garant (régression batch 34)", () => {
  const base = { revenus_mensuels: 3000, situation_pro: "CDI", nom: "X", telephone: "0600" } as ScreeningProfil
  const loyer = 1000

  it("type_garant 'Personne physique' donne le bonus garant même sans flag boolean", () => {
    const r = computeScreening({ ...base, type_garant: "Personne physique" }, loyer)
    expect(r.flags).not.toContain("Pas de garant")
    expect(r.flags).not.toContain("Garant non renseigné")
  })

  it("type_garant 'Organisme (Visale)' → bonus garant", () => {
    const r = computeScreening({ ...base, type_garant: "Organisme (Visale)" }, loyer)
    expect(r.flags).not.toContain("Pas de garant")
  })

  it("type_garant 'Aucun garant' → pénalité Pas de garant", () => {
    const r = computeScreening({ ...base, type_garant: "Aucun garant" }, loyer)
    expect(r.flags).toContain("Pas de garant")
  })

  it("type_garant vide ET garant non défini → flag 'Garant non renseigné'", () => {
    const r = computeScreening({ ...base, type_garant: null }, loyer)
    expect(r.flags).toContain("Garant non renseigné")
  })

  it("flag garant=true prime sur type_garant vide", () => {
    const r = computeScreening({ ...base, garant: true, type_garant: "" }, loyer)
    expect(r.flags).not.toContain("Pas de garant")
  })
})

// ─── V1.5 — Brancher critères annonce dans le screening ───────────────────
describe("computeScreening — critères annonce (V1.5 Paul 2026-04-27)", () => {
  it("min_revenus_ratio 4× — locataire à 3× est juste insuffisant", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", garant: true }
    // Sans annonce : ratio 3× = parfait, score solva 45
    const baseline = computeScreening(p, 1000)
    expect(baseline.flags.every(f => !f.includes("attendu"))).toBe(true)
    // Avec annonce 4× : ratio 3× est juste 1 point en dessous → tier moyen
    const ajuste = computeScreening(p, 1000, { min_revenus_ratio: 4 })
    expect(ajuste.flags.some(f => /attendu 4\.0×/i.test(f))).toBe(true)
  })

  it("min_revenus_ratio 3.5× — locataire à 3.5× ratio passe", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3500, situation_pro: "CDI", garant: true }
    const r = computeScreening(p, 1000, { min_revenus_ratio: 3.5 })
    expect(r.flags.every(f => !f.includes("Revenus") || !f.includes("loyer"))).toBe(true)
  })

  it("garants_acceptes ['Visale'] — garant 'Garantme' candidat est flag", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", type_garant: "Garantme" }
    const r = computeScreening(p, 1000, { garants_acceptes: ["Visale"] })
    expect(r.flags.some(f => f.includes("non listé dans les acceptés"))).toBe(true)
  })

  it("garants_acceptes ['Visale', 'Indifférent'] — Indifférent désactive le filtre", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", type_garant: "Garantme" }
    const r = computeScreening(p, 1000, { garants_acceptes: ["Visale", "Indifférent"] })
    expect(r.flags.every(f => !f.includes("non listé"))).toBe(true)
  })

  it("garants_acceptes ['Visale'] — garant 'Visale' candidat est accepté", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", type_garant: "Organisme (Visale)" }
    const r = computeScreening(p, 1000, { garants_acceptes: ["Visale"] })
    expect(r.flags.every(f => !f.includes("non listé"))).toBe(true)
  })

  it("profils_acceptes ['CDI'] — candidat CDD est flag", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDD", garant: true }
    const r = computeScreening(p, 1000, { profils_acceptes: ["CDI"] })
    expect(r.flags.some(f => f.includes("non listé dans les acceptés"))).toBe(true)
  })

  it("profils_acceptes ['CDI', 'Fonctionnaire'] — candidat CDI est accepté", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", garant: true }
    const r = computeScreening(p, 1000, { profils_acceptes: ["CDI", "Fonctionnaire"] })
    expect(r.flags.every(f => !f.includes("non listé"))).toBe(true)
  })

  it("annonce null — comportement identique au screening v1 (backward compat)", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", garant: true }
    const v1 = computeScreening(p, 1000)
    const v2null = computeScreening(p, 1000, null)
    const v2undef = computeScreening(p, 1000, undefined)
    expect(v2null.score).toBe(v1.score)
    expect(v2undef.score).toBe(v1.score)
  })

  it("garants_acceptes vide ou null — pas de filtre", () => {
    const p: ScreeningProfil = { revenus_mensuels: 3000, situation_pro: "CDI", type_garant: "Garantme" }
    const r1 = computeScreening(p, 1000, { garants_acceptes: [] })
    const r2 = computeScreening(p, 1000, { garants_acceptes: null })
    expect(r1.flags.every(f => !f.includes("non listé"))).toBe(true)
    expect(r2.flags.every(f => !f.includes("non listé"))).toBe(true)
  })
})
