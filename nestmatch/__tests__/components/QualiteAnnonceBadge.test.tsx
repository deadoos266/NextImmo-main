// @vitest-environment jsdom
// V10.1 — integration tests V9.3 QualiteAnnonceBadge.

import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import QualiteAnnonceBadge from "../../app/annonces/[id]/QualiteAnnonceBadge"

afterEach(() => cleanup())

const PERFECT_INPUT = {
  photos: ["a", "b", "c", "d", "e", "f"],
  description: "x".repeat(350),
  message_proprietaire: "Bonjour",
  dpe: "B",
  localisation_exacte: true,
  chambres: 2, pieces: 3, surface: 60,
}

describe("QualiteAnnonceBadge", () => {
  it("affiche le score 100/100 et tier Premium pour annonce parfaite", () => {
    render(<QualiteAnnonceBadge annonce={PERFECT_INPUT} />)
    expect(screen.getAllByText(/100/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Annonce premium/i)).toBeTruthy()
  })

  it("affiche tier Incomplete pour annonce vide (sans signal qualite)", () => {
    render(<QualiteAnnonceBadge annonce={{}} />)
    // Score 0 → tier incomplete
    expect(screen.getByText(/Annonce incomplète/i)).toBeTruthy()
    const pb = screen.getByRole("progressbar")
    expect(pb.getAttribute("aria-valuenow")).toBe("0")
  })

  it("variant compact rend pill mais sans progress bar", () => {
    const { container } = render(<QualiteAnnonceBadge annonce={PERFECT_INPUT} compact />)
    expect(screen.getByText("100/100")).toBeTruthy()
    // progress bar role="progressbar" present uniquement en mode full
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
  })

  it("mode full inclut un role=progressbar avec la valeur correcte", () => {
    render(<QualiteAnnonceBadge annonce={PERFECT_INPUT} />)
    const pb = screen.getByRole("progressbar")
    expect(pb.getAttribute("aria-valuenow")).toBe("100")
    expect(pb.getAttribute("aria-valuemin")).toBe("0")
    expect(pb.getAttribute("aria-valuemax")).toBe("100")
  })

  it("DPE F attribue 0 pts → score reduit", () => {
    render(<QualiteAnnonceBadge annonce={{ ...PERFECT_INPUT, dpe: "F" }} />)
    // 100 - 15 (DPE) = 85 → toujours premium
    expect(screen.getByText(/85/)).toBeTruthy()
  })
})
