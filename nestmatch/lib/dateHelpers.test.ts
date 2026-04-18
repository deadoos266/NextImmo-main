import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { joursRelatif, formatDateFR } from "./dateHelpers"

describe("joursRelatif", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("renvoie 'Aujourd'hui' pour la date du jour (avant l'instant courant)", () => {
    vi.setSystemTime(new Date(2026, 3, 19, 14))
    // Target à 10h, now à 14h → diff négatif sur ~4h → ceil donne 0 → Aujourd'hui
    expect(joursRelatif(new Date(2026, 3, 19, 10).toISOString())).toBe("Aujourd'hui")
  })

  it("renvoie 'Demain' pour J+1", () => {
    vi.setSystemTime(new Date(2026, 3, 19, 10))
    expect(joursRelatif(new Date(2026, 3, 20, 10).toISOString())).toBe("Demain")
  })

  it("renvoie 'Dans N j' pour les dates futures", () => {
    vi.setSystemTime(new Date(2026, 3, 19, 10))
    expect(joursRelatif(new Date(2026, 3, 25, 10).toISOString())).toBe("Dans 6 j")
  })

  it("renvoie 'Passée' pour les dates passées", () => {
    vi.setSystemTime(new Date(2026, 3, 19, 10))
    expect(joursRelatif(new Date(2026, 3, 15, 10).toISOString())).toBe("Passée")
  })

  it("renvoie '' pour une date invalide", () => {
    expect(joursRelatif("pas une date")).toBe("")
    expect(joursRelatif("")).toBe("")
  })
})

describe("formatDateFR", () => {
  it("formate une date ISO en FR long par défaut", () => {
    const result = formatDateFR("2026-04-19")
    // "dimanche 19 avril 2026" selon les locales, on teste des fragments robustes
    expect(result).toMatch(/19/)
    expect(result).toMatch(/avril/i)
    expect(result).toMatch(/2026/)
  })

  it("accepte un ISO avec heure et ignore l'heure", () => {
    const result = formatDateFR("2026-04-19T23:30:00Z")
    expect(result).toMatch(/19/)
    expect(result).toMatch(/avril/i)
  })

  it("accepte des options custom", () => {
    const result = formatDateFR("2026-04-19", { day: "numeric", month: "short" })
    expect(result).toMatch(/19/)
  })

  it("renvoie '' si raw invalide", () => {
    expect(formatDateFR("")).toBe("")
    expect(formatDateFR(null)).toBe("")
    expect(formatDateFR(undefined)).toBe("")
    expect(formatDateFR("pas-une-date")).toBe("")
    expect(formatDateFR(42 as unknown as string)).toBe("")
  })
})
