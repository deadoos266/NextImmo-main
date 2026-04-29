import { describe, it, expect } from "vitest"
import { hashBailData, canonicalPayloadString, constantTimeEqual } from "./bailHash"
import type { BailData } from "./bailPDF"

const baseBail: BailData = {
  type: "vide",
  nomBailleur: "Marc Dupont",
  adresseBailleur: "12 rue Test, 75015 Paris",
  emailBailleur: "marc@example.com",
  nomLocataire: "Léa Martin",
  emailLocataire: "lea@example.com",
  titreBien: "2 pièces Bastille",
  adresseBien: "5 rue Saint-Antoine",
  villeBien: "Paris",
  surface: 42,
  pieces: 2,
  etage: "3e",
  description: "Lumineux 2 pièces",
  meuble: false,
  parking: false,
  cave: true,
  dateDebut: "2026-05-01",
  duree: 36,
  loyerHC: 1200,
  charges: 100,
  caution: 1200,
  modeReglement: "Virement bancaire",
  dateReglement: "Le 1er du mois",
  dpe: "C",
}

describe("hashBailData", () => {
  it("retourne un hash sha256 préfixé de longueur 7+64", async () => {
    const h = await hashBailData(baseBail)
    expect(h).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it("est déterministe : même input → même hash", async () => {
    const h1 = await hashBailData(baseBail)
    const h2 = await hashBailData(baseBail)
    expect(h1).toBe(h2)
  })

  it("est canonique : ordre des clés ne change pas le hash", async () => {
    const reordered: BailData = {
      ...baseBail,
      // Réordonné via spread mais TypeScript garde l'ordre déclaré → on
      // simule via casting + Object.assign d'une copie reverse.
    }
    const reverse = Object.fromEntries(Object.entries(baseBail).reverse()) as BailData
    const h1 = await hashBailData(baseBail)
    const h2 = await hashBailData(reordered)
    const h3 = await hashBailData(reverse)
    expect(h1).toBe(h2)
    expect(h1).toBe(h3)
  })

  it("change si un champ canonique change", async () => {
    const h1 = await hashBailData(baseBail)
    const h2 = await hashBailData({ ...baseBail, loyerHC: 1300 })
    expect(h1).not.toBe(h2)
  })

  it("ne change PAS si seules les signatures sont ajoutées", async () => {
    const h1 = await hashBailData(baseBail)
    const h2 = await hashBailData({
      ...baseBail,
      signatures: [{
        role: "locataire",
        nom: "Léa",
        png: "data:image/png;base64,xxx",
        signeAt: "2026-05-01T10:00:00Z",
      }],
    })
    expect(h1).toBe(h2)
  })

  it("ne change PAS si fichierUrl est ajouté (champ transient)", async () => {
    const h1 = await hashBailData(baseBail)
    const h2 = await hashBailData({ ...baseBail, fichierUrl: "https://storage.example.com/bail.pdf" })
    expect(h1).toBe(h2)
  })

  it("change si la ville change", async () => {
    const h1 = await hashBailData(baseBail)
    const h2 = await hashBailData({ ...baseBail, villeBien: "Lyon" })
    expect(h1).not.toBe(h2)
  })
})

describe("canonicalPayloadString", () => {
  it("produit du JSON déterministe utilisable pour stockage", () => {
    const s = canonicalPayloadString(baseBail)
    expect(s).toContain("Bastille")
    expect(s).not.toContain("signatures") // exclu
    // Doit être JSON parsable (même si non standard, on peut le rebuilder)
    expect(() => JSON.parse(s)).not.toThrow()
  })
})

describe("constantTimeEqual", () => {
  it("retourne true pour deux strings identiques", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true)
  })

  it("retourne false pour deux strings différentes de même longueur", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false)
  })

  it("retourne false pour longueurs différentes", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false)
  })
})
