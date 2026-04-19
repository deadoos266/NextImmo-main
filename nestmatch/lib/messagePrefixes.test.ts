import { describe, it, expect } from "vitest"
import { PREFIXES, getPrefix, stripPrefix, previewLabel } from "./messagePrefixes"

describe("messagePrefixes", () => {
  describe("getPrefix", () => {
    it("détecte chaque préfixe connu", () => {
      expect(getPrefix("[DOSSIER_CARD]...")).toBe("DOSSIER")
      expect(getPrefix("[BAIL_CARD]...")).toBe("BAIL")
      expect(getPrefix("[QUITTANCE_CARD]...")).toBe("QUITTANCE")
      expect(getPrefix("[EDL_CARD]...")).toBe("EDL")
      expect(getPrefix("[LOCATION_ACCEPTEE]...")).toBe("LOCATION_ACCEPTEE")
    })

    it("retourne null pour un texte normal", () => {
      expect(getPrefix("Bonjour !")).toBeNull()
      expect(getPrefix("")).toBeNull()
      expect(getPrefix(null)).toBeNull()
      expect(getPrefix(undefined)).toBeNull()
    })

    it("ne matche pas un préfixe inconnu", () => {
      expect(getPrefix("[INCONNU]payload")).toBeNull()
    })
  })

  describe("stripPrefix", () => {
    it("retire le préfixe et garde la charge utile", () => {
      expect(stripPrefix("[BAIL_CARD]{\"a\":1}", "BAIL")).toBe("{\"a\":1}")
      expect(stripPrefix("[QUITTANCE_CARD]x", "QUITTANCE")).toBe("x")
    })
  })

  describe("previewLabel", () => {
    it("retourne un label court pour chaque préfixe", () => {
      expect(previewLabel("[DOSSIER_CARD]x")).toBe("Dossier envoyé")
      expect(previewLabel("[QUITTANCE_CARD]x")).toBe("Quittance reçue")
      expect(previewLabel("[BAIL_CARD]x")).toBe("Bail généré")
      expect(previewLabel("[EDL_CARD]x")).toBe("État des lieux envoyé")
      expect(previewLabel("[LOCATION_ACCEPTEE]x")).toBe("Location acceptée ✓")
    })

    it("inclut le message de relance (tronqué)", () => {
      expect(previewLabel("[RELANCE]coucou")).toBe("Relance : coucou")
    })

    it("retourne null pour un texte normal", () => {
      expect(previewLabel("Bonjour")).toBeNull()
      expect(previewLabel(null)).toBeNull()
    })
  })

  it("exporte tous les préfixes avec les valeurs attendues", () => {
    expect(PREFIXES.QUITTANCE).toBe("[QUITTANCE_CARD]")
    expect(PREFIXES.VISITE).toBe("[VISITE_CARD]")
    expect(PREFIXES.CONTRE_PROPOSITION).toBe("[CONTRE_PROPOSITION]")
  })
})
