import { describe, it, expect } from "vitest"
import { STATUT_VISITE_STYLE, STATUT_VISITE_DOT, type StatutVisite } from "./visitesHelpers"

describe("STATUT_VISITE_STYLE", () => {
  it("couvre les 4 statuts attendus", () => {
    const statuts: StatutVisite[] = ["proposée", "confirmée", "annulée", "effectuée"]
    for (const s of statuts) {
      expect(STATUT_VISITE_STYLE[s]).toBeDefined()
      expect(STATUT_VISITE_STYLE[s].label).toBeTruthy()
      expect(STATUT_VISITE_STYLE[s].color).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      expect(STATUT_VISITE_STYLE[s].bg).toMatch(/^#[0-9a-fA-F]{3,6}$/)
      expect(STATUT_VISITE_STYLE[s].border).toMatch(/^#[0-9a-fA-F]{3,6}$/)
    }
  })

  it("labels cohérents et lisibles", () => {
    expect(STATUT_VISITE_STYLE["proposée"].label).toBe("En attente")
    expect(STATUT_VISITE_STYLE["confirmée"].label).toBe("Confirmée")
    expect(STATUT_VISITE_STYLE["annulée"].label).toBe("Annulée")
    expect(STATUT_VISITE_STYLE["effectuée"].label).toBe("Effectuée")
  })
})

describe("STATUT_VISITE_DOT", () => {
  it("couvre les 4 statuts avec une couleur", () => {
    const statuts: StatutVisite[] = ["proposée", "confirmée", "annulée", "effectuée"]
    for (const s of statuts) {
      expect(STATUT_VISITE_DOT[s]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
