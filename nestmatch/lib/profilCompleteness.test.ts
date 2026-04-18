import { describe, it, expect } from "vitest"
import { calculerCompletudeProfil } from "./profilCompleteness"

describe("calculerCompletudeProfil", () => {
  it("profil null → score 0 et manquants contient 'Profil à créer'", () => {
    const r = calculerCompletudeProfil(null)
    expect(r.score).toBe(0)
    expect(r.manquants).toContain("Profil à créer")
  })

  it("profil undefined → score 0", () => {
    const r = calculerCompletudeProfil(undefined)
    expect(r.score).toBe(0)
  })

  it("profil vide ({}) → score 0 et tous les critères en manquants", () => {
    const r = calculerCompletudeProfil({})
    expect(r.score).toBe(0)
    expect(r.manquants).toContain("Ville souhaitée")
    expect(r.manquants).toContain("Budget maximum")
    expect(r.manquants).toContain("Revenus mensuels")
    expect(r.manquants).toContain("Surface minimum")
    expect(r.manquants).toContain("Type de garant")
    expect(r.manquants).toContain("Type de quartier")
  })

  it("profil complet → score 100 et manquants vide", () => {
    const profil = {
      ville_souhaitee: "Paris",
      budget_max: 1200,
      revenus_mensuels: 3500,
      surface_min: 40,
      type_garant: "Parent",
      type_quartier: "calme",
    }
    const r = calculerCompletudeProfil(profil)
    expect(r.score).toBe(100)
    expect(r.manquants).toEqual([])
  })

  it("progression monotone quand on ajoute des champs", () => {
    const p0 = {}
    const p1 = { ville_souhaitee: "Paris" }
    const p2 = { ville_souhaitee: "Paris", budget_max: 1200 }
    const p3 = { ville_souhaitee: "Paris", budget_max: 1200, revenus_mensuels: 3500 }
    const p4 = { ...p3, surface_min: 40 }
    const p5 = { ...p4, type_garant: "Parent" }
    const p6 = { ...p5, type_quartier: "calme" }

    const scores = [p0, p1, p2, p3, p4, p5, p6].map(p => calculerCompletudeProfil(p).score)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
    expect(scores[0]).toBe(0)
    expect(scores[scores.length - 1]).toBe(100)
  })

  it("les poids individuels sont respectés (ville=20, surface=15, quartier=10)", () => {
    expect(calculerCompletudeProfil({ ville_souhaitee: "Paris" }).score).toBe(20)
    expect(calculerCompletudeProfil({ surface_min: 40 }).score).toBe(15)
    expect(calculerCompletudeProfil({ type_quartier: "calme" }).score).toBe(10)
  })

  it("les valeurs falsy n'ajoutent pas de points", () => {
    const r = calculerCompletudeProfil({ ville_souhaitee: "", budget_max: 0, revenus_mensuels: null })
    expect(r.score).toBe(0)
  })

  it("manquants est cohérent avec le score", () => {
    const profil = { ville_souhaitee: "Paris", budget_max: 1200 }
    const r = calculerCompletudeProfil(profil)
    expect(r.score).toBe(40)
    expect(r.manquants).not.toContain("Ville souhaitée")
    expect(r.manquants).not.toContain("Budget maximum")
    expect(r.manquants).toContain("Revenus mensuels")
    expect(r.manquants).toHaveLength(4)
  })
})
