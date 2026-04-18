import { describe, it, expect } from "vitest"
import { displayName, maskEmail } from "./privacy"

describe("displayName", () => {
  it("retourne fallbackName en priorité si fourni non vide", () => {
    expect(displayName("jean@example.com", "Jean Dupont")).toBe("Jean Dupont")
  })

  it("trim le fallbackName", () => {
    expect(displayName("jean@example.com", "  Jean Dupont  ")).toBe("Jean Dupont")
  })

  it("ignore fallbackName vide et utilise l'email", () => {
    expect(displayName("jean.dupont@example.com", "")).toBe("Jean Dupont")
    expect(displayName("jean.dupont@example.com", "   ")).toBe("Jean Dupont")
  })

  it("convertit points/underscores/tirets en espaces puis capitalise", () => {
    expect(displayName("jean.dupont@example.com")).toBe("Jean Dupont")
    expect(displayName("jean_dupont@example.com")).toBe("Jean Dupont")
    expect(displayName("jean-dupont@example.com")).toBe("Jean Dupont")
    expect(displayName("jean_dupont.marc@example.com")).toBe("Jean Dupont Marc")
  })

  it("gère les locales mono-partie", () => {
    expect(displayName("jdupont@example.com")).toBe("Jdupont")
  })

  it("retourne 'Utilisateur' si email null/vide", () => {
    expect(displayName(null)).toBe("Utilisateur")
    expect(displayName(undefined)).toBe("Utilisateur")
    expect(displayName("")).toBe("Utilisateur")
  })

  it("retourne 'Utilisateur' si partie locale vide", () => {
    expect(displayName("@example.com")).toBe("Utilisateur")
  })

  it("lowercase le reste après la première lettre", () => {
    expect(displayName("JEAN.DUPONT@example.com")).toBe("Jean Dupont")
  })
})

describe("maskEmail", () => {
  it("masque la partie domaine", () => {
    expect(maskEmail("jean.dupont@gmail.com")).toBe("jean.dupont@***")
  })

  it("retourne chaîne vide si email null", () => {
    expect(maskEmail(null)).toBe("")
    expect(maskEmail(undefined)).toBe("")
    expect(maskEmail("")).toBe("")
  })

  it("gère un email sans @ (fallback)", () => {
    expect(maskEmail("plainstring")).toBe("plainstring@***")
  })
})
