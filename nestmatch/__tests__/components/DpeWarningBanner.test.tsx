// @vitest-environment jsdom
// V10.1 (Paul 2026-04-28) — integration tests V9.1 DpeWarningBanner.

import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import DpeWarningBanner from "../../app/annonces/[id]/DpeWarningBanner"

afterEach(() => cleanup())

describe("DpeWarningBanner", () => {
  it("ne rend rien si dpe null/undefined", () => {
    const { container } = render(<DpeWarningBanner dpe={null} />)
    expect(container.firstChild).toBeNull()
  })

  it("ne rend rien si dpe vide", () => {
    const { container } = render(<DpeWarningBanner dpe="" />)
    expect(container.firstChild).toBeNull()
  })

  it("ne rend rien si dpe A-E (pas concerne)", () => {
    for (const letter of ["A", "B", "C", "D", "E"]) {
      const { container } = render(<DpeWarningBanner dpe={letter} />)
      expect(container.firstChild).toBeNull()
      cleanup()
    }
  })

  it("rend le banner si dpe F (futur 2028)", () => {
    render(<DpeWarningBanner dpe="F" />)
    expect(screen.getAllByText(/2028/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/à partir de janvier 2028/i)).toBeTruthy()
  })

  it("rend le banner si dpe G (deja interdit)", () => {
    render(<DpeWarningBanner dpe="G" />)
    expect(screen.getByText(/ne pourra plus être proposée/i)).toBeTruthy()
  })

  it("contient lien legifrance avec target _blank rel noopener", () => {
    render(<DpeWarningBanner dpe="F" />)
    const link = screen.getByText(/En savoir plus/i).closest("a")
    expect(link).toBeTruthy()
    expect(link?.getAttribute("target")).toBe("_blank")
    expect(link?.getAttribute("rel")).toContain("noopener")
    expect(link?.getAttribute("href")).toContain("legifrance")
  })

  it("accepte dpe en lowercase 'f' / 'g'", () => {
    render(<DpeWarningBanner dpe="f" />)
    expect(screen.getAllByText(/2028/i).length).toBeGreaterThan(0)
  })
})
