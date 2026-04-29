import { describe, it, expect } from "vitest"
import { computeBailTimeline } from "./bailTimeline"

const baseAnnonce = { id: 1, statut: null, bail_genere_at: null, date_debut_bail: null }

describe("computeBailTimeline", () => {
  it("retourne 4 étapes dans l'ordre fixe", () => {
    const steps = computeBailTimeline({ annonce: baseAnnonce, edls: [], loyers: [], role: "locataire" })
    expect(steps.map(s => s.key)).toEqual(["acceptee", "bail", "edl", "loyer"])
  })

  it("tout à 0 : aucune étape terminée", () => {
    const steps = computeBailTimeline({ annonce: baseAnnonce, edls: [], loyers: [], role: "locataire" })
    expect(steps.every(s => s.done === false)).toBe(true)
  })

  it("statut loué → étape acceptée cochée", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué" },
      edls: [],
      loyers: [],
      role: "locataire",
    })
    expect(steps[0].done).toBe(true)
    expect(steps[1].done).toBe(false)
  })

  it("bail_genere_at posé → étape bail cochée + date renvoyée", () => {
    const iso = "2026-04-01T00:00:00Z"
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué", bail_genere_at: iso },
      edls: [],
      loyers: [],
      role: "locataire",
    })
    expect(steps[1].done).toBe(true)
    expect(steps[1].date).toBe(iso)
  })

  it("EDL entrée validé compte, EDL sortie non", () => {
    const base = { annonce: { ...baseAnnonce, statut: "loué" }, loyers: [], role: "locataire" as const }
    const sortieOnly = computeBailTimeline({
      ...base,
      edls: [{ type: "sortie", statut: "valide" }],
    })
    expect(sortieOnly[2].done).toBe(false)
    const entreeDraft = computeBailTimeline({
      ...base,
      edls: [{ type: "entree", statut: "brouillon" }],
    })
    expect(entreeDraft[2].done).toBe(false)
    const entreeValide = computeBailTimeline({
      ...base,
      edls: [{ type: "entree", statut: "valide" }],
    })
    expect(entreeValide[2].done).toBe(true)
  })

  it("loyer confirmé → étape loyer cochée", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué" },
      edls: [],
      loyers: [{ statut: "déclaré" }, { statut: "confirmé", mois: "2026-04" }],
      role: "locataire",
    })
    expect(steps[3].done).toBe(true)
  })

  it("role=proprietaire → étapes non-faites ont un href vers les bonnes pages", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué", id: 42 },
      edls: [],
      loyers: [],
      role: "proprietaire",
    })
    expect(steps[1].href).toBe("/proprietaire/bail/42")
    expect(steps[2].href).toBe("/proprietaire/edl/42")
    expect(steps[3].href).toBe("/proprietaire/stats?id=42")
  })

  it("role=locataire → pas de href sur étapes qu'il ne peut pas faire lui-même", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué" },
      edls: [],
      loyers: [],
      role: "locataire",
    })
    expect(steps[1].href).toBeUndefined()
    expect(steps[2].href).toBeUndefined()
  })

  it("étape terminée → href effacé (pas besoin de CTA)", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué", bail_genere_at: "2026-04-01" },
      edls: [],
      loyers: [],
      role: "proprietaire",
    })
    expect(steps[1].href).toBeUndefined()
  })

  // V33.3 — sous-états signature
  it("locataire a signé seul → wording 'Vous avez signé'", () => {
    const steps = computeBailTimeline({
      annonce: {
        ...baseAnnonce,
        statut: "loué",
        bail_genere_at: "2026-04-01",
        bail_signe_locataire_at: "2026-04-02",
        bail_signe_bailleur_at: null,
      },
      edls: [],
      loyers: [],
      role: "locataire",
    })
    expect(steps[1].label).toBe("Vous avez signé le bail")
    expect(steps[1].description).toContain("bailleur doit maintenant contresigner")
  })

  it("locataire a signé seul, vue proprio → wording 'Locataire a signé'", () => {
    const steps = computeBailTimeline({
      annonce: {
        ...baseAnnonce,
        statut: "loué",
        bail_genere_at: "2026-04-01",
        bail_signe_locataire_at: "2026-04-02",
      },
      edls: [],
      loyers: [],
      role: "proprietaire",
    })
    expect(steps[1].label).toBe("Locataire a signé le bail")
    expect(steps[1].description).toContain("contresigner")
  })

  it("double signature → wording 'Bail signé par les deux parties'", () => {
    const steps = computeBailTimeline({
      annonce: {
        ...baseAnnonce,
        statut: "loué",
        bail_genere_at: "2026-04-01",
        bail_signe_locataire_at: "2026-04-02",
        bail_signe_bailleur_at: "2026-04-03",
      },
      edls: [],
      loyers: [],
      role: "locataire",
    })
    expect(steps[1].label).toBe("Bail signé par les deux parties")
    expect(steps[1].description).toContain("juridiquement actif")
    // La date renvoyée est celle du bailleur (= signature finale)
    expect(steps[1].date).toBe("2026-04-03")
  })

  it("bail envoyé sans aucune signature → wording 'Bail à signer' côté locataire", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "bail_envoye", bail_genere_at: "2026-04-01" },
      edls: [],
      loyers: [],
      role: "locataire",
    })
    expect(steps[1].label).toBe("Bail à signer")
    expect(steps[1].description).toContain("messagerie")
  })

  it("rôle locataire → label étape 1 = 'Candidature acceptée'", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué" },
      edls: [],
      loyers: [],
      role: "locataire",
    })
    expect(steps[0].label).toBe("Candidature acceptée")
    expect(steps[0].description).toContain("retenu")
  })

  it("rôle proprio → label étape 1 = 'Location acceptée'", () => {
    const steps = computeBailTimeline({
      annonce: { ...baseAnnonce, statut: "loué" },
      edls: [],
      loyers: [],
      role: "proprietaire",
    })
    expect(steps[0].label).toBe("Location acceptée")
  })
})
