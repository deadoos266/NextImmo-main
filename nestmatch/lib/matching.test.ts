import { describe, it, expect } from "vitest"
import { calculerScore, estExclu, labelScore, expliquerScore, type Annonce, type Profil } from "./matching"

describe("calculerScore", () => {
  it("retourne 500 (neutre) quand le profil est null", () => {
    const annonce: Annonce = { ville: "Paris", prix: 1200, surface: 50, pieces: 2 }
    // @ts-expect-error — on teste explicitement le cas null
    const score = calculerScore(annonce, null)
    expect(score).toBe(500)
  })

  it("retourne 500 (neutre) quand le profil est undefined", () => {
    const annonce: Annonce = { ville: "Paris", prix: 1200, surface: 50, pieces: 2 }
    // @ts-expect-error — on teste explicitement le cas undefined
    const score = calculerScore(annonce, undefined)
    expect(score).toBe(500)
  })

  it("profil vide (objet {}) retourne un score neutre autour de 500", () => {
    const annonce: Annonce = { ville: "Paris", prix: 1200, surface: 50, pieces: 2 }
    const score = calculerScore(annonce, {} as Profil)
    // Neutre somme : 150 + 135 + 75 + 70 + 70 + 25 = 525
    expect(score).toBeGreaterThanOrEqual(450)
    expect(score).toBeLessThanOrEqual(600)
  })

  it("happy path : match complet donne un score élevé", () => {
    const profil: Profil = {
      ville_souhaitee: "Paris",
      budget_max: 1500,
      surface_min: 45,
      pieces_min: 2,
      meuble: true,
      parking: true,
      balcon: true,
      fibre: true,
      dpe_min: "B",
    }
    const annonce: Annonce = {
      ville: "Paris",
      prix: 1400,
      surface: 55,
      pieces: 3,
      meuble: true,
      parking: true,
      balcon: true,
      fibre: true,
      dpe: "B",
    }
    const score = calculerScore(annonce, profil)
    expect(score).toBeGreaterThanOrEqual(800)
    expect(score).toBeLessThanOrEqual(1000)
  })

  it("clamp : jamais < 0 ni > 1000", () => {
    const profil: Profil = { budget_max: 500, surface_min: 200, pieces_min: 5 }
    const annonce: Annonce = { prix: 5000, surface: 10, pieces: 1 }
    const score = calculerScore(annonce, profil)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1000)
  })

  it("score plus élevé quand budget respecté vs dépassé", () => {
    const profil: Profil = { budget_max: 1000, surface_min: 40 }
    const okAnnonce: Annonce = { prix: 950, surface: 40 }
    const koAnnonce: Annonce = { prix: 1150, surface: 40 }
    expect(calculerScore(okAnnonce, profil)).toBeGreaterThan(calculerScore(koAnnonce, profil))
  })
})

describe("estExclu", () => {
  it("retourne false quand le profil est null/undefined", () => {
    const annonce: Annonce = { ville: "Paris", prix: 5000 }
    // @ts-expect-error — cas null
    expect(estExclu(annonce, null)).toBe(false)
    // @ts-expect-error — cas undefined
    expect(estExclu(annonce, undefined)).toBe(false)
  })

  it("exclut quand le budget est dépassé de plus de 20%", () => {
    const profil: Profil = { budget_max: 1000 }
    const annonce: Annonce = { prix: 1300 } // +30%
    expect(estExclu(annonce, profil)).toBe(true)
  })

  it("n'exclut pas quand le budget est dépassé de moins de 20%", () => {
    const profil: Profil = { budget_max: 1000 }
    const annonce: Annonce = { prix: 1100 } // +10%
    expect(estExclu(annonce, profil)).toBe(false)
  })

  it("mode strict : exclut si la ville ne correspond pas", () => {
    const profil: Profil = { mode_localisation: "strict", ville_souhaitee: "Paris" }
    const annonce: Annonce = { ville: "Lyon" }
    expect(estExclu(annonce, profil)).toBe(true)
  })

  it("mode strict : n'exclut pas si la ville correspond", () => {
    const profil: Profil = { mode_localisation: "strict", ville_souhaitee: "Paris" }
    const annonce: Annonce = { ville: "Paris 15e" }
    expect(estExclu(annonce, profil)).toBe(false)
  })

  it("exclut si animaux souhaités mais refusés par l'annonce", () => {
    const profil: Profil = { animaux: true }
    const annonce: Annonce = { animaux: false }
    expect(estExclu(annonce, profil)).toBe(true)
  })

  it("n'exclut pas si animaux souhaités et acceptés par l'annonce", () => {
    const profil: Profil = { animaux: true }
    const annonce: Annonce = { animaux: true }
    expect(estExclu(annonce, profil)).toBe(false)
  })
})

describe("labelScore", () => {
  it("renvoie 'Excellent match' pour score ≥ 900", () => {
    expect(labelScore(950).label).toBe("Excellent match")
  })
  it("renvoie 'Très bon match' pour 750 ≤ score < 900", () => {
    expect(labelScore(800).label).toBe("Très bon match")
  })
  it("renvoie 'Faible match' pour score < 400", () => {
    expect(labelScore(300).label).toBe("Faible match")
  })
})

describe("expliquerScore", () => {
  it("retourne [] si profil null", () => {
    // @ts-expect-error — cas null
    expect(expliquerScore({}, null)).toEqual([])
  })

  it("produit des raisons cohérentes avec un budget dépassé", () => {
    const raisons = expliquerScore(
      { prix: 1200, surface: 50 },
      { budget_max: 1000, surface_min: 40 }
    )
    expect(raisons.some(r => r.includes("Dépasse"))).toBe(true)
  })
})
