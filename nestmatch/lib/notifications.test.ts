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
  it("contient tous les types canoniques (assertion par contenu, pas par count)", () => {
    // Avant : `.toHaveLength(12)` hardcodé → cassait à chaque ajout (audit
    // 2026-04-26 : on est à 17 types après les ajouts quittance_disponible,
    // candidature_validee/devalidee, bail_a_signer, carnet_signalement).
    // Maintenant : on liste les types attendus, on vérifie inclusion + on
    // exige au moins ce socle (mais plus = OK, ne casse pas).
    const requis = [
      "message",
      "visite_proposee", "visite_confirmee", "visite_annulee",
      "location_acceptee", "location_refusee",
      "loyer_retard",
      "bail_genere", "bail_signe", "bail_a_signer",
      "edl_envoye",
      "dossier_consulte",
      "candidature_retiree", "candidature_validee", "candidature_devalidee",
      "quittance_disponible",
      "carnet_signalement",
    ]
    for (const t of requis) {
      expect(NOTIF_TYPES).toContain(t)
    }
    // Sanity-check : pas de doublon dans la liste
    expect(new Set(NOTIF_TYPES).size).toBe(NOTIF_TYPES.length)
    // Borne haute pour détecter une fuite massive de types ajoutés sans review
    expect(NOTIF_TYPES.length).toBeLessThan(40)
  })
})
