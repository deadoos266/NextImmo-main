import { describe, it, expect } from "vitest"
import { getDateDebutBailFromAnnonce, getDateDebutBailIso, getDateDebutBailFr } from "./bailDates"

describe("V25.1 getDateDebutBail — source unique annonces > import_metadata > null", () => {
  it("annonce.date_debut_bail défini → priorité canonical", () => {
    const annonce = {
      date_debut_bail: "2026-05-15",
      import_metadata: { date_debut: "2099-01-01" }, // attaque/dérive — ignoré
    }
    const d = getDateDebutBailFromAnnonce(annonce)
    expect(d).not.toBeNull()
    expect(d!.toISOString().startsWith("2026-05-15")).toBe(true)
  })

  it("annonce.date_debut_bail null + import_metadata.date_debut défini → fallback", () => {
    const annonce = {
      date_debut_bail: null,
      import_metadata: { date_debut: "2026-06-01" },
    }
    const d = getDateDebutBailFromAnnonce(annonce)
    expect(d).not.toBeNull()
    expect(d!.toISOString().startsWith("2026-06-01")).toBe(true)
  })

  it("annonce sans aucune date → null", () => {
    expect(getDateDebutBailFromAnnonce({})).toBeNull()
    expect(getDateDebutBailFromAnnonce({ date_debut_bail: null })).toBeNull()
    expect(getDateDebutBailFromAnnonce({ import_metadata: null })).toBeNull()
    expect(getDateDebutBailFromAnnonce({ import_metadata: { date_debut: null } })).toBeNull()
  })

  it("annonce null/undefined → null (defensive)", () => {
    expect(getDateDebutBailFromAnnonce(null)).toBeNull()
    expect(getDateDebutBailFromAnnonce(undefined)).toBeNull()
  })

  it("date invalide canonical → fallback sur import_metadata", () => {
    const annonce = {
      date_debut_bail: "not-a-date-bogus",
      import_metadata: { date_debut: "2026-07-01" },
    }
    const d = getDateDebutBailFromAnnonce(annonce)
    expect(d).not.toBeNull()
    expect(d!.toISOString().startsWith("2026-07-01")).toBe(true)
  })

  it("getDateDebutBailIso — wrapper string YYYY-MM-DD", () => {
    expect(getDateDebutBailIso({ date_debut_bail: "2026-05-15" })).toBe("2026-05-15")
    expect(getDateDebutBailIso({})).toBeNull()
  })

  it("getDateDebutBailFr — wrapper formaté FR", () => {
    const result = getDateDebutBailFr({ date_debut_bail: "2026-05-15" })
    expect(result).toMatch(/15.*mai.*2026/i)
    expect(getDateDebutBailFr({})).toBeNull()
  })
})
