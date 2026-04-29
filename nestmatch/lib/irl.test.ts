import { describe, it, expect } from "vitest"
import { irlDernier, irlDuTrimestre, calculerNouveauLoyer, fenetreIndexation } from "./irl"

describe("irlDernier", () => {
  it("retourne le 1er élément du tableau (le plus récent)", () => {
    const dernier = irlDernier()
    expect(dernier).toBeDefined()
    expect(dernier.trimestre).toMatch(/^T[1-4] \d{4}$/)
  })
})

describe("irlDuTrimestre", () => {
  it("retourne l'IRL pour T3 2025", () => {
    const e = irlDuTrimestre("T3 2025")
    expect(e).not.toBeNull()
    expect(e!.indice).toBe(145.47)
  })

  it("retourne l'IRL via objet annee+trimNum", () => {
    const e = irlDuTrimestre({ annee: 2024, trimNum: 4 })
    expect(e).not.toBeNull()
    expect(e!.trimestre).toBe("T4 2024")
  })

  it("retourne null pour un trimestre inconnu", () => {
    expect(irlDuTrimestre("T2 2030")).toBeNull()
    expect(irlDuTrimestre({ annee: 2030, trimNum: 1 })).toBeNull()
  })
})

describe("calculerNouveauLoyer", () => {
  it("indexation simple : 1000€ × 145.66/144.50 ≈ 1008.03€", () => {
    const r = calculerNouveauLoyer(1000, 144.50, 145.66)
    expect(r.nouveauLoyer).toBeCloseTo(1008.03, 2)
    expect(r.variation).toBeCloseTo(8.03, 2)
    expect(r.variationPct).toBeCloseTo(0.00803, 4)
  })

  it("baisse possible si IRL nouveau < IRL ancien", () => {
    const r = calculerNouveauLoyer(1000, 145.00, 144.00)
    expect(r.nouveauLoyer).toBeLessThan(1000)
    expect(r.variation).toBeLessThan(0)
  })

  it("ratio = 1 → loyer inchangé", () => {
    const r = calculerNouveauLoyer(1200, 145.47, 145.47)
    expect(r.nouveauLoyer).toBe(1200)
    expect(r.variation).toBe(0)
  })
})

describe("fenetreIndexation", () => {
  const now = new Date("2026-04-29T00:00:00Z")

  it("bail signé il y a moins d'un an → pas éligible", () => {
    const debut = new Date("2025-08-01T00:00:00Z") // 9 mois avant now
    const r = fenetreIndexation(debut, null, now)
    expect(r.eligible).toBe(false)
    expect(r.prochaineDateAnniversaire.getFullYear()).toBe(2026)
  })

  it("bail signé il y a un peu moins d'un an et dans les 30 jours → éligible", () => {
    const debut = new Date("2025-05-15T00:00:00Z") // anniversaire à venir 15 mai 2026 = 16j
    const r = fenetreIndexation(debut, null, now)
    expect(r.eligible).toBe(true)
    expect(r.joursAvantAnniv).toBeLessThanOrEqual(30)
  })

  it("bail anniversaire passé < 90 jours sans indexation → éligible", () => {
    const debut = new Date("2025-03-01T00:00:00Z") // anniv 2026-03-01 = 59j passé
    const r = fenetreIndexation(debut, null, now)
    expect(r.eligible).toBe(true)
  })

  it("indexation récente (3 mois) → bloque même si anniv proche", () => {
    const debut = new Date("2025-05-15T00:00:00Z")
    const dernierIndex = new Date("2026-02-01T00:00:00Z") // 3 mois avant now
    const r = fenetreIndexation(debut, dernierIndex, now)
    expect(r.eligible).toBe(false)
  })

  it("indexation ancienne (12 mois+) → ne bloque pas", () => {
    const debut = new Date("2025-05-15T00:00:00Z")
    const dernierIndex = new Date("2025-04-01T00:00:00Z") // 12+ mois avant now
    const r = fenetreIndexation(debut, dernierIndex, now)
    expect(r.eligible).toBe(true)
  })

  it("date début invalide → eligible false", () => {
    const r = fenetreIndexation("garbage", null, now)
    expect(r.eligible).toBe(false)
  })
})
