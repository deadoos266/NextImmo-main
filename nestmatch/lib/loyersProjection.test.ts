import { describe, it, expect } from "vitest"
import { projeterEcheancierBail, prochaineEcheance, compterPayes } from "./loyersProjection"

describe("projeterEcheancierBail", () => {
  const NOW = new Date("2026-04-29T12:00:00Z").getTime()

  it("retourne 36 mois par défaut", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-04-01",
      loyerCC: 1200,
      loyersExistants: [],
      now: NOW,
    })
    expect(res).toHaveLength(36)
  })

  it("respecte dureeMois passée en argument", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-04-01",
      dureeMois: 12,
      loyerCC: 800,
      loyersExistants: [],
      now: NOW,
    })
    expect(res).toHaveLength(12)
  })

  it("retourne tableau vide si pas de date début", () => {
    expect(projeterEcheancierBail({ dateDebutBail: null, loyerCC: 1000, loyersExistants: [] })).toHaveLength(0)
    expect(projeterEcheancierBail({ dateDebutBail: undefined, loyerCC: 1000, loyersExistants: [] })).toHaveLength(0)
  })

  it("retourne tableau vide si loyerCC <= 0", () => {
    expect(projeterEcheancierBail({ dateDebutBail: "2026-04-01", loyerCC: 0, loyersExistants: [] })).toHaveLength(0)
  })

  it("merge loyer existant payé → statut paye + utilise montant DB", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-04-01",
      dureeMois: 3,
      loyerCC: 1200,
      loyersExistants: [
        { id: 1, mois: "2026-04", statut: "confirmé", montant: 1180, date_confirmation: "2026-04-05", quittance_envoyee_at: "2026-04-06" },
      ],
      now: NOW,
    })
    expect(res[0].statut).toBe("paye")
    expect(res[0].loyerId).toBe(1)
    expect(res[0].montant).toBe(1180) // ne reproduit PAS le DB
    expect(res[0].quittanceDispo).toBe(true)
  })

  it("loyer déclaré → statut declare", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-05-01",
      dureeMois: 1,
      loyerCC: 1000,
      loyersExistants: [{ id: 7, mois: "2026-05", statut: "déclaré", montant: 1000 }],
      now: NOW,
    })
    expect(res[0].statut).toBe("declare")
  })

  it("échéance dans <5 jours → imminent", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-05-02",
      dureeMois: 1,
      loyerCC: 950,
      loyersExistants: [],
      now: NOW,
    })
    expect(res[0].statut).toBe("imminent")
  })

  it("échéance > 5 jours → futur", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-08-01",
      dureeMois: 1,
      loyerCC: 950,
      loyersExistants: [],
      now: NOW,
    })
    expect(res[0].statut).toBe("futur")
    expect(res[0].joursAvantEcheance).toBeGreaterThan(5)
  })

  it("échéance > 5 jours dans le passé sans row → passe_inconnu", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2025-04-01",
      dureeMois: 1,
      loyerCC: 1000,
      loyersExistants: [],
      now: NOW,
    })
    expect(res[0].statut).toBe("passe_inconnu")
  })

  it("loyer existant déclaré, peu importe la date, prend le statut DB", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2025-04-01",
      dureeMois: 1,
      loyerCC: 1000,
      loyersExistants: [{ id: 9, mois: "2025-04", statut: "déclaré", montant: 1000 }],
      now: NOW,
    })
    // Le statut DB existant prévaut sur le calcul d'âge (cohérence avec UI proprio).
    expect(res[0].statut).toBe("declare")
  })

  it("date début dans le passé → projection inclut mois passés et futurs", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-01-01",
      dureeMois: 6,
      loyerCC: 950,
      loyersExistants: [
        { id: 1, mois: "2026-01", statut: "confirmé", montant: 950 },
        { id: 2, mois: "2026-02", statut: "confirmé", montant: 950 },
      ],
      now: NOW,
    })
    expect(res).toHaveLength(6)
    expect(res[0].statut).toBe("paye")
    expect(res[1].statut).toBe("paye")
    // Avril 2026 — l'échéance était le 1er, on est le 29, donc passé sans row → passe_inconnu
    expect(res[3].statut).toBe("passe_inconnu")
    // Mai 2026 (1er) à 2 jours du 29 avril → imminent (≤ 5 jours)
    expect(res[4].statut).toBe("imminent")
    // Juin 2026 → futur (> 5 jours)
    expect(res[5].statut).toBe("futur")
  })
})

describe("compterPayes", () => {
  it("compte les statuts paye", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-01-01",
      dureeMois: 4,
      loyerCC: 1000,
      loyersExistants: [
        { id: 1, mois: "2026-01", statut: "confirmé", montant: 1000 },
        { id: 2, mois: "2026-02", statut: "confirmé", montant: 1000 },
        { id: 3, mois: "2026-03", statut: "déclaré", montant: 1000 },
      ],
      now: new Date("2026-04-29T12:00:00Z").getTime(),
    })
    expect(compterPayes(res)).toBe(2)
  })
})

describe("prochaineEcheance", () => {
  it("renvoie le 1er mois non-payé futur (skip passe_inconnu)", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-01-01",
      dureeMois: 6,
      loyerCC: 1000,
      loyersExistants: [
        { id: 1, mois: "2026-01", statut: "confirmé", montant: 1000 },
        { id: 2, mois: "2026-02", statut: "confirmé", montant: 1000 },
        // 03 et 04 passe_inconnu (passé sans row)
        // 05 et 06 futur
      ],
      now: new Date("2026-04-29T12:00:00Z").getTime(),
    })
    const next = prochaineEcheance(res)
    expect(next).not.toBeNull()
    // Le 1er non-payé non-passe_inconnu est 2026-05
    expect(next!.mois).toBe("2026-05")
  })

  it("retourne null si tout est payé", () => {
    const res = projeterEcheancierBail({
      dateDebutBail: "2026-04-01",
      dureeMois: 1,
      loyerCC: 1000,
      loyersExistants: [{ id: 1, mois: "2026-04", statut: "confirmé", montant: 1000 }],
      now: new Date("2026-04-29T12:00:00Z").getTime(),
    })
    expect(prochaineEcheance(res)).toBeNull()
  })
})
