import { describe, it, expect } from "vitest"
import { resolveTheme, THEME_KEY, getStoredTheme } from "./theme"

// Vitest tourne en Node par defaut : window/document sont undefined.
// Les fonctions doivent gerer ce cas sans crasher et retourner le defaut
// produit ("light").

describe("resolveTheme", () => {
  it("light reste light", () => {
    expect(resolveTheme("light")).toBe("light")
  })

  it("dark reste dark", () => {
    expect(resolveTheme("dark")).toBe("dark")
  })

  it("system sans window tombe sur light (SSR / defaut produit)", () => {
    // En contexte Vitest node, typeof window === 'undefined'
    expect(resolveTheme("system")).toBe("light")
  })
})

describe("getStoredTheme", () => {
  it("sans window retourne light (SSR default)", () => {
    // En contexte Vitest node, typeof window === 'undefined'
    expect(getStoredTheme()).toBe("light")
  })
})

describe("THEME_KEY", () => {
  it("est la cle localStorage partagee", () => {
    expect(THEME_KEY).toBe("nestmatch-theme")
  })
})
