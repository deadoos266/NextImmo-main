// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import GatedAction from "../GatedAction"

afterEach(() => cleanup())

const reason = {
  title: "Bientôt disponible",
  body: "Cette fonction sera active une fois votre dossier complété.",
}
const reasonWithCta = {
  title: "Action requise",
  body: "Vous devez compléter votre profil.",
  cta: { label: "Compléter le profil", href: "/profil" },
}

describe("GatedAction — enabled mode", () => {
  it("rend les enfants tels quels (passthrough) quand enabled=true", () => {
    render(
      <GatedAction enabled disabledReason={reason}>
        <a href="/foo" data-testid="link">Mon lien</a>
      </GatedAction>
    )
    const link = screen.getByTestId("link")
    expect(link).toBeTruthy()
    expect(link.getAttribute("href")).toBe("/foo")
    expect(link.getAttribute("aria-disabled")).toBeNull()
  })

  it("appelle onClick quand enabled et fourni", () => {
    const onClick = vi.fn()
    render(
      <GatedAction enabled disabledReason={reason} onClick={onClick}>
        <span data-testid="trigger">Action</span>
      </GatedAction>
    )
    fireEvent.click(screen.getByTestId("trigger"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe("GatedAction — disabled mode", () => {
  it("applique aria-disabled + style disabled sur le wrapper", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span data-testid="child">Mon logement</span>
      </GatedAction>
    )
    const wrapper = screen.getByRole("button")
    expect(wrapper.getAttribute("aria-disabled")).toBe("true")
    expect(wrapper.style.cursor).toBe("not-allowed")
    expect(wrapper.style.opacity).toBe("0.5")
  })

  it("ouvre le popup au click avec title + body affichés", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span>Mon logement</span>
      </GatedAction>
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button"))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(screen.getByText(reason.title)).toBeTruthy()
    expect(screen.getByText(reason.body)).toBeTruthy()
  })

  it("ouvre aussi le popup au clavier Enter/Espace", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span>X</span>
      </GatedAction>
    )
    const wrapper = screen.getByRole("button")
    fireEvent.keyDown(wrapper, { key: "Enter" })
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("le popup se ferme au click sur la croix Fermer", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span>X</span>
      </GatedAction>
    )
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.click(screen.getByLabelText("Fermer"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("le popup se ferme au click sur le scrim", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span>X</span>
      </GatedAction>
    )
    fireEvent.click(screen.getByRole("button"))
    const dialog = screen.getByRole("dialog")
    fireEvent.click(dialog)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("le popup ne se ferme PAS au click sur son contenu interne", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span>X</span>
      </GatedAction>
    )
    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(screen.getByText(reason.title))
    expect(screen.queryByRole("dialog")).toBeTruthy()
  })

  it("le popup se ferme à la touche Escape", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span>X</span>
      </GatedAction>
    )
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("CTA href : rend un lien <a> qui ferme le popup au click", () => {
    render(
      <GatedAction enabled={false} disabledReason={reasonWithCta}>
        <span>X</span>
      </GatedAction>
    )
    fireEvent.click(screen.getByRole("button"))
    const cta = screen.getByText(reasonWithCta.cta.label)
    const link = cta.closest("a")
    expect(link).toBeTruthy()
    expect(link!.getAttribute("href")).toBe("/profil")
  })

  it("CTA onClick : déclenche le callback ET ferme le popup", () => {
    const onCta = vi.fn()
    const reasonWithCallback = {
      title: "Réessayer ?",
      body: "Action manuelle requise.",
      cta: { label: "Lancer", onClick: onCta },
    }
    render(
      <GatedAction enabled={false} disabledReason={reasonWithCallback}>
        <span>X</span>
      </GatedAction>
    )
    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(screen.getByText("Lancer"))
    expect(onCta).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("aria-describedby pointe vers le body du popup ouvert", () => {
    render(
      <GatedAction enabled={false} disabledReason={reason}>
        <span>X</span>
      </GatedAction>
    )
    const wrapper = screen.getByRole("button")
    const describedBy = wrapper.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    fireEvent.click(wrapper)
    const bodyEl = document.getElementById(describedBy!)
    expect(bodyEl).toBeTruthy()
    expect(bodyEl!.textContent).toContain(reason.body)
  })
})
