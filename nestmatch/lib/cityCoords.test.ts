import { describe, it, expect } from "vitest"
import { getCityCoords, normalizeCityName, CITY_NAMES } from "./cityCoords"

describe("getCityCoords", () => {
  it("retourne les coords de Paris pour 'Paris'", () => {
    const coords = getCityCoords("Paris")
    expect(coords).toEqual([48.8566, 2.3522])
  })

  it("insensible à la casse : 'Paris', 'paris', 'PARIS' → même résultat", () => {
    const a = getCityCoords("Paris")
    const b = getCityCoords("paris")
    const c = getCityCoords("PARIS")
    expect(a).toEqual(b)
    expect(b).toEqual(c)
  })

  it("insensible aux accents : 'Saint-Étienne' et 'Saint-Etienne' → mêmes coords", () => {
    const avecAccent = getCityCoords("Saint-Étienne")
    const sansAccent = getCityCoords("Saint-Etienne")
    expect(avecAccent).not.toBeNull()
    expect(avecAccent).toEqual(sansAccent)
  })

  it("gère les espaces (trim)", () => {
    const a = getCityCoords("  Paris  ")
    expect(a).toEqual([48.8566, 2.3522])
  })

  it("retourne null pour une ville inexistante", () => {
    expect(getCityCoords("Ville-inexistante-xyz")).toBeNull()
  })

  it("retourne null pour une string vide", () => {
    expect(getCityCoords("")).toBeNull()
  })

  it("gère les villes composées avec tiret (Aix-en-Provence)", () => {
    const coords = getCityCoords("Aix-en-Provence")
    expect(coords).toEqual([43.5297, 5.4474])
  })

  it("gère les villes avec espace (Le Havre, La Rochelle)", () => {
    expect(getCityCoords("Le Havre")).toEqual([49.4938, 0.1079])
    expect(getCityCoords("La Rochelle")).toEqual([46.1603, -1.1511])
  })
})

describe("normalizeCityName", () => {
  it("met la première lettre en majuscule", () => {
    expect(normalizeCityName("paris")).toBe("Paris")
  })

  it("gère les noms composés", () => {
    expect(normalizeCityName("saint-etienne")).toBe("Saint-Etienne")
    expect(normalizeCityName("aix-en-provence")).toBe("Aix-En-Provence")
  })

  it("trim les espaces", () => {
    expect(normalizeCityName("  lyon  ")).toBe("Lyon")
  })
})

describe("CITY_NAMES", () => {
  it("contient des villes connues", () => {
    expect(CITY_NAMES).toContain("Paris")
    expect(CITY_NAMES).toContain("Lyon")
  })

  it("est trié en ordre alphabétique français", () => {
    const sorted = [...CITY_NAMES].sort((a, b) => a.localeCompare(b, "fr"))
    expect(CITY_NAMES).toEqual(sorted)
  })
})
