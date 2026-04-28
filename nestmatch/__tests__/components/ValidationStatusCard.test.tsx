// @vitest-environment jsdom
// V11.17 — tests unifies du composant ValidationStatusCard.

import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import ValidationStatusCard, { type ValidationStatusKind } from "../../app/messages/ValidationStatusCard"

afterEach(() => cleanup())

describe("ValidationStatusCard", () => {
  it.each<ValidationStatusKind>(["success", "warning", "danger", "info"])(
    "affiche eyebrow + body + date pour kind=%s",
    (kind) => {
      render(
        <ValidationStatusCard
          kind={kind}
          eyebrow={`EYEBROW-${kind}`}
          body={`Body text ${kind}`}
          date="26 avril 2026"
        />
      )
      expect(screen.getByText(`EYEBROW-${kind}`)).toBeTruthy()
      expect(screen.getByText(`Body text ${kind}`)).toBeTruthy()
      expect(screen.getByText("26 avril 2026")).toBeTruthy()
    }
  )

  it("rend body riche avec strong sans casser", () => {
    render(
      <ValidationStatusCard
        kind="success"
        eyebrow="Candidature validée"
        body={
          <>
            Vous avez validé la candidature pour <strong>{`« aa »`}</strong>.
          </>
        }
        date="26 avril 2026"
      />
    )
    expect(screen.getByText("« aa »")).toBeTruthy()
  })

  it("affiche le hint quand fourni", () => {
    render(
      <ValidationStatusCard
        kind="warning"
        eyebrow="Validation retirée"
        body="Body"
        hint="Hint complementaire"
      />
    )
    expect(screen.getByText("Hint complementaire")).toBeTruthy()
  })

  it("affiche le CTA quand fourni", () => {
    render(
      <ValidationStatusCard
        kind="danger"
        eyebrow="Candidature non retenue"
        body="Body"
        cta={<a href="/annonces">Voir annonces</a>}
      />
    )
    expect(screen.getByText("Voir annonces")).toBeTruthy()
  })

  it("ne rend pas la date si non fournie", () => {
    render(
      <ValidationStatusCard
        kind="info"
        eyebrow="EYEBROW"
        body="Body sans date"
      />
    )
    expect(screen.queryByText(/avril 2026/)).toBeNull()
  })
})
