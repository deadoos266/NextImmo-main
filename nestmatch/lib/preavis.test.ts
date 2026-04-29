import { describe, it, expect } from "vitest"
import { calculerPreavis, joursAvantFinPreavis, formatJoursRestants, jalonNotif } from "./preavis"

const baseDate = new Date("2026-04-01T00:00:00Z")

describe("calculerPreavis — locataire", () => {
  it("vide hors zone tendue → 3 mois", () => {
    const r = calculerPreavis({ qui: "locataire", meuble: false, zoneTendue: false, dateEnvoi: baseDate })
    expect(r.delaiMois).toBe(3)
    expect(r.dateFinLegale.getMonth()).toBe(6) // juillet
  })

  it("vide en zone tendue → 1 mois", () => {
    const r = calculerPreavis({ qui: "locataire", meuble: false, zoneTendue: true, dateEnvoi: baseDate })
    expect(r.delaiMois).toBe(1)
    expect((r.bonus || "").toLowerCase()).toContain("zone tendue")
  })

  it("meublé → 1 mois", () => {
    const r = calculerPreavis({ qui: "locataire", meuble: true, zoneTendue: false, dateEnvoi: baseDate })
    expect(r.delaiMois).toBe(1)
    expect(r.bonus).toContain("meublé")
  })

  it("motif mutation pro → 1 mois", () => {
    const r = calculerPreavis({ qui: "locataire", meuble: false, zoneTendue: false, motifLocataire: "mutation_pro", dateEnvoi: baseDate })
    expect(r.delaiMois).toBe(1)
    expect(r.bonus).toContain("Motif réduit")
  })

  it("motif achat (non réduit) → 3 mois", () => {
    const r = calculerPreavis({ qui: "locataire", meuble: false, zoneTendue: false, motifLocataire: "achat", dateEnvoi: baseDate })
    expect(r.delaiMois).toBe(3)
  })

  it("date départ souhaitée APRÈS dateFinLegale → effective = souhaitée", () => {
    const souhaitee = new Date("2026-09-15T00:00:00Z")
    const r = calculerPreavis({ qui: "locataire", meuble: false, zoneTendue: false, dateEnvoi: baseDate, dateDepartSouhaitee: souhaitee })
    expect(r.dateFinEffective.getTime()).toBe(souhaitee.getTime())
  })

  it("date départ souhaitée AVANT dateFinLegale → effective = légale (pas de raccourci)", () => {
    const souhaitee = new Date("2026-05-15T00:00:00Z")
    const r = calculerPreavis({ qui: "locataire", meuble: false, zoneTendue: false, dateEnvoi: baseDate, dateDepartSouhaitee: souhaitee })
    expect(r.dateFinEffective.getTime()).toBe(r.dateFinLegale.getTime())
  })
})

describe("calculerPreavis — proprio", () => {
  it("toujours 6 mois", () => {
    const r = calculerPreavis({ qui: "proprietaire", meuble: false, zoneTendue: true, dateEnvoi: baseDate })
    expect(r.delaiMois).toBe(6)
    expect(r.bonus).toContain("6 mois minimum")
  })

  it("dateFinLegale + 6 mois", () => {
    const r = calculerPreavis({ qui: "proprietaire", meuble: false, zoneTendue: false, dateEnvoi: baseDate })
    expect(r.dateFinLegale.getMonth()).toBe(9) // octobre (avril + 6)
  })
})

describe("joursAvantFinPreavis", () => {
  it("retourne diff jours positive si futur", () => {
    const now = new Date("2026-04-01T00:00:00Z")
    const fin = new Date("2026-05-01T00:00:00Z")
    expect(joursAvantFinPreavis(fin, now)).toBe(30)
  })

  it("retourne 0 si même jour", () => {
    const d = new Date("2026-04-01T00:00:00Z")
    expect(joursAvantFinPreavis(d, d)).toBe(0)
  })

  it("retourne diff négative si passé", () => {
    const now = new Date("2026-04-15T00:00:00Z")
    const fin = new Date("2026-04-01T00:00:00Z")
    expect(joursAvantFinPreavis(fin, now)).toBe(-14)
  })
})

describe("formatJoursRestants", () => {
  it("dans 30 jours", () => {
    expect(formatJoursRestants(30)).toBe("dans 30 jours")
  })

  it("demain", () => {
    expect(formatJoursRestants(1)).toBe("demain")
  })

  it("aujourd'hui", () => {
    expect(formatJoursRestants(0)).toBe("aujourd'hui")
  })

  it("hier", () => {
    expect(formatJoursRestants(-1)).toBe("hier")
  })
})

describe("jalonNotif", () => {
  it("J-30 → 30", () => expect(jalonNotif(30)).toBe(30))
  it("J-15 → 15", () => expect(jalonNotif(15)).toBe(15))
  it("J-7 → 7", () => expect(jalonNotif(7)).toBe(7))
  it("J-1 → 1", () => expect(jalonNotif(1)).toBe(1))
  it("J-31 → null", () => expect(jalonNotif(31)).toBeNull())
})
