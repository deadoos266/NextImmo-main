import { describe, it, expect } from "vitest"
import { isNotifType, NOTIF_TYPES } from "./notifications"

describe("isNotifType", () => {
  it("accepte tous les types whitelistés", () => {
    for (const t of NOTIF_TYPES) {
      expect(isNotifType(t)).toBe(true)
    }
  })

  it("refuse les valeurs inconnues", () => {
    expect(isNotifType("autre")).toBe(false)
    expect(isNotifType("MESSAGE")).toBe(false) // casse-sensible
    expect(isNotifType("")).toBe(false)
  })

  it("refuse les types non-string", () => {
    expect(isNotifType(42)).toBe(false)
    expect(isNotifType(null)).toBe(false)
    expect(isNotifType(undefined)).toBe(false)
    expect(isNotifType({ type: "message" })).toBe(false)
    expect(isNotifType(["message"])).toBe(false)
  })
})

describe("NOTIF_TYPES", () => {
  it("exporte les 10 types attendus", () => {
    expect(NOTIF_TYPES).toHaveLength(10)
    expect(NOTIF_TYPES).toContain("message")
    expect(NOTIF_TYPES).toContain("visite_proposee")
    expect(NOTIF_TYPES).toContain("visite_confirmee")
    expect(NOTIF_TYPES).toContain("visite_annulee")
    expect(NOTIF_TYPES).toContain("location_acceptee")
    expect(NOTIF_TYPES).toContain("location_refusee")
    expect(NOTIF_TYPES).toContain("loyer_retard")
    expect(NOTIF_TYPES).toContain("bail_genere")
    expect(NOTIF_TYPES).toContain("dossier_consulte")
    expect(NOTIF_TYPES).toContain("candidature_retiree")
  })
})
