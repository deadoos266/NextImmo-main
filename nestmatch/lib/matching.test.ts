import { describe, it, expect } from "vitest"
import { calculerScore, estExclu, labelScore, expliquerScore, type Annonce, type Profil } from "./matching"

describe("calculerScore", () => {
  it("retourne 500 (neutre) quand le profil est null", () => {
    const annonce: Annonce = { ville: "Paris", prix: 1200, surface: 50, pieces: 2 }
    const score = calculerScore(annonce, null)
    expect(score).toBe(500)
  })

  it("retourne 500 (neutre) quand le profil est undefined", () => {
    const annonce: Annonce = { ville: "Paris", prix: 1200, surface: 50, pieces: 2 }
    const score = calculerScore(annonce, undefined)
    expect(score).toBe(500)
  })

  it("profil vide (objet {}) retourne un score neutre autour de 500", () => {
    const annonce: Annonce = { ville: "Paris", prix: 1200, surface: 50, pieces: 2 }
    const score = calculerScore(annonce, {} as Profil)
    // Neutre somme : 150 + 135 + 75 + 70 + 70 + 25 = 525
    expect(score).toBeGreaterThanOrEqual(450)
    expect(score).toBeLessThanOrEqual(600)
  })

  it("happy path : match complet donne un score élevé", () => {
    const profil: Profil = {
      ville_souhaitee: "Paris",
      budget_max: 1500,
      surface_min: 45,
      pieces_min: 2,
      meuble: true,
      parking: true,
      balcon: true,
      fibre: true,
      dpe_min: "B",
    }
    const annonce: Annonce = {
      ville: "Paris",
      prix: 1400,
      surface: 55,
      pieces: 3,
      meuble: true,
      parking: true,
      balcon: true,
      fibre: true,
      dpe: "B",
    }
    const score = calculerScore(annonce, profil)
    expect(score).toBeGreaterThanOrEqual(800)
    expect(score).toBeLessThanOrEqual(1000)
  })

  it("clamp : jamais < 0 ni > 1000", () => {
    const profil: Profil = { budget_max: 500, surface_min: 200, pieces_min: 5 }
    const annonce: Annonce = { prix: 5000, surface: 10, pieces: 1 }
    const score = calculerScore(annonce, profil)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1000)
  })

  it("score plus élevé quand budget respecté vs dépassé", () => {
    const profil: Profil = { budget_max: 1000, surface_min: 40 }
    const okAnnonce: Annonce = { prix: 950, surface: 40 }
    const koAnnonce: Annonce = { prix: 1150, surface: 40 }
    expect(calculerScore(okAnnonce, profil)).toBeGreaterThan(calculerScore(koAnnonce, profil))
  })
})

describe("estExclu", () => {
  it("retourne false quand le profil est null/undefined", () => {
    const annonce: Annonce = { ville: "Paris", prix: 5000 }
    expect(estExclu(annonce, null)).toBe(false)
    expect(estExclu(annonce, undefined)).toBe(false)
  })

  it("exclut quand le budget est dépassé de plus de 20%", () => {
    const profil: Profil = { budget_max: 1000 }
    const annonce: Annonce = { prix: 1300 } // +30%
    expect(estExclu(annonce, profil)).toBe(true)
  })

  it("n'exclut pas quand le budget est dépassé de moins de 20%", () => {
    const profil: Profil = { budget_max: 1000 }
    const annonce: Annonce = { prix: 1100 } // +10%
    expect(estExclu(annonce, profil)).toBe(false)
  })

  it("mode strict : exclut si la ville ne correspond pas", () => {
    const profil: Profil = { mode_localisation: "strict", ville_souhaitee: "Paris" }
    const annonce: Annonce = { ville: "Lyon" }
    expect(estExclu(annonce, profil)).toBe(true)
  })

  it("mode strict : n'exclut pas si la ville correspond", () => {
    const profil: Profil = { mode_localisation: "strict", ville_souhaitee: "Paris" }
    const annonce: Annonce = { ville: "Paris 15e" }
    expect(estExclu(annonce, profil)).toBe(false)
  })

  it("exclut si animaux souhaités mais refusés par l'annonce", () => {
    const profil: Profil = { animaux: true }
    const annonce: Annonce = { animaux: false }
    expect(estExclu(annonce, profil)).toBe(true)
  })

  it("n'exclut pas si animaux souhaités et acceptés par l'annonce", () => {
    const profil: Profil = { animaux: true }
    const annonce: Annonce = { animaux: true }
    expect(estExclu(annonce, profil)).toBe(false)
  })
})

describe("labelScore", () => {
  it("renvoie 'Excellent match' pour score ≥ 900", () => {
    expect(labelScore(950).label).toBe("Excellent match")
  })
  it("renvoie 'Très bon match' pour 750 ≤ score < 900", () => {
    expect(labelScore(800).label).toBe("Très bon match")
  })
  it("renvoie 'Faible match' pour score < 400", () => {
    expect(labelScore(300).label).toBe("Faible match")
  })
})

describe("expliquerScore", () => {
  it("retourne [] si profil null", () => {
    expect(expliquerScore({}, null)).toEqual([])
  })

  it("produit des raisons cohérentes avec un budget dépassé", () => {
    const raisons = expliquerScore(
      { prix: 1200, surface: 50 },
      { budget_max: 1000, surface_min: 40 }
    )
    expect(raisons.some(r => r.includes("Dépasse"))).toBe(true)
  })
})

// Régression batch 34 : jardin pris en compte dans les équipements
describe("calculerScore — jardin (régression batch 34)", () => {
  it("un profil qui demande jardin + annonce avec jardin → score meilleur qu'annonce sans", () => {
    const base: Annonce = { ville: "Lyon", prix: 1200, surface: 60, pieces: 3 }
    const profil: Profil = { jardin: true }
    const avecJardin = calculerScore({ ...base, jardin: true }, profil)
    const sansJardin = calculerScore({ ...base, jardin: false }, profil)
    expect(avecJardin).toBeGreaterThan(sansJardin)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// R10.6 — critères candidats v2 (age / occupants / animaux / fumeur) +
// garantie que les discriminants légalement protégés n'affectent pas le score.
// ═══════════════════════════════════════════════════════════════════════════

const baseR10ProfilMatch: Profil = {
  ville_souhaitee: "Paris",
  budget_max: 1200,
  surface_min: 30,
  pieces_min: 2,
  chambres_min: 1,
  meuble: false,
}
const baseR10Annonce: Annonce = {
  ville: "Paris",
  prix: 1100,
  surface: 35,
  pieces: 2,
  chambres: 1,
  meuble: false,
  dpe: "C",
}

describe("R10.6 — discriminants protégés n'abaissent JAMAIS le score", () => {
  it("nb_enfants n'influe pas le score", () => {
    const a = calculerScore(baseR10Annonce, { ...baseR10ProfilMatch, nb_enfants: 0 })
    const b = calculerScore(baseR10Annonce, { ...baseR10ProfilMatch, nb_enfants: 5 })
    expect(a).toBe(b)
  })
  it("situation_familiale n'influe pas le score", () => {
    const a = calculerScore(baseR10Annonce, { ...baseR10ProfilMatch, situation_familiale: "celibataire" })
    const b = calculerScore(baseR10Annonce, { ...baseR10ProfilMatch, situation_familiale: "marie" })
    expect(a).toBe(b)
  })
  it("nationalité / religion / orientation n'influent pas le score", () => {
    const base = calculerScore(baseR10Annonce, baseR10ProfilMatch)
    expect(calculerScore(baseR10Annonce, { ...baseR10ProfilMatch, nationalite: "MA" })).toBe(base)
    expect(calculerScore(baseR10Annonce, { ...baseR10ProfilMatch, religion: "catholique" })).toBe(base)
    expect(calculerScore(baseR10Annonce, { ...baseR10ProfilMatch, orientation: "homosexuel" })).toBe(base)
  })
})

describe("R10.6 — critères v2 bonus/malus ciblés", () => {
  it("âge dans la borne → bonus ; hors borne → neutre (pas de malus)", () => {
    const dn = new Date()
    dn.setFullYear(dn.getFullYear() - 32)
    const profil: Profil = { ...baseR10ProfilMatch, date_naissance: dn.toISOString().slice(0, 10) }
    const sans = calculerScore(baseR10Annonce, profil)
    const dansBorne = calculerScore({ ...baseR10Annonce, age_min: 25, age_max: 40 }, profil)
    const horsBorne = calculerScore({ ...baseR10Annonce, age_min: 50, age_max: 70 }, profil)
    expect(dansBorne).toBeGreaterThan(sans)
    expect(horsBorne).toBe(sans)
  })

  it("occupants sous plafond → bonus ; au-dessus → neutre", () => {
    const profilOk: Profil = { ...baseR10ProfilMatch, nb_occupants: 2 }
    const profilKo: Profil = { ...baseR10ProfilMatch, nb_occupants: 5 }
    const sansContrainte = calculerScore(baseR10Annonce, profilOk)
    const bonus = calculerScore({ ...baseR10Annonce, max_occupants: 3 }, profilOk)
    const neutre = calculerScore({ ...baseR10Annonce, max_occupants: 3 }, profilKo)
    expect(bonus).toBeGreaterThan(sansContrainte)
    expect(neutre).toBe(calculerScore(baseR10Annonce, profilKo))
  })

  it("fumeur_politique=non + fumeur locataire = petit malus", () => {
    const profil: Profil = { ...baseR10ProfilMatch, fumeur: true }
    const sans = calculerScore(baseR10Annonce, profil)
    const avec = calculerScore({ ...baseR10Annonce, fumeur_politique: "non" }, profil)
    expect(avec).toBeLessThan(sans)
  })

  it("fumeur_politique=indifferent : neutre", () => {
    const profil: Profil = { ...baseR10ProfilMatch, fumeur: true }
    const a = calculerScore(baseR10Annonce, profil)
    const b = calculerScore({ ...baseR10Annonce, fumeur_politique: "indifferent" }, profil)
    expect(a).toBe(b)
  })

  it("animaux_politique=oui + locataire avec animaux = bonus léger", () => {
    const profil: Profil = { ...baseR10ProfilMatch, animaux: true }
    const sans = calculerScore({ ...baseR10Annonce, animaux: true }, profil)
    const avec = calculerScore({ ...baseR10Annonce, animaux: true, animaux_politique: "oui" }, profil)
    expect(avec).toBeGreaterThan(sans)
  })

  it("score reste dans [0, 1000] avec tous les bonus cumulés", () => {
    const s = calculerScore(
      { ...baseR10Annonce, age_min: 18, age_max: 99, max_occupants: 5, animaux_politique: "oui", fumeur_politique: "oui" },
      {
        ...baseR10ProfilMatch, budget_max: 2000, surface_min: 20, pieces_min: 1, chambres_min: 0,
        nb_occupants: 1, animaux: true, fumeur: true, date_naissance: "1990-01-01",
      },
    )
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(1000)
  })
})

describe("R10.6 — estExclu + animaux_politique prend le pas sur boolean", () => {
  it("politique=non + locataire animaux → exclu", () => {
    const excluded = estExclu(
      { ...baseR10Annonce, animaux_politique: "non", animaux: true },
      { ...baseR10ProfilMatch, animaux: true },
    )
    expect(excluded).toBe(true)
  })
  it("politique=oui + locataire animaux → pas exclu (même si annonce.animaux=false)", () => {
    const excluded = estExclu(
      { ...baseR10Annonce, animaux_politique: "oui", animaux: false },
      { ...baseR10ProfilMatch, animaux: true },
    )
    expect(excluded).toBe(false)
  })
  it("politique=null (fallback legacy) : boolean annonce.animaux=false + locataire animaux → exclu", () => {
    const excluded = estExclu(
      { ...baseR10Annonce, animaux: false },
      { ...baseR10ProfilMatch, animaux: true },
    )
    expect(excluded).toBe(true)
  })
})


// ─── V2.2 — tolerance_budget_pct + dpe_min_actif (Paul 2026-04-27) ────────
describe("V2.2 estExclu — tolerance_budget_pct user-controlled", () => {
  const annonce: Annonce = { ville: "paris", prix: 1300 }

  it("tolerance default 20% — annonce 1300/budget 1000 (=130%) → exclue", () => {
    const exc = estExclu(annonce, { budget_max: 1000 })
    expect(exc).toBe(true)
  })

  it("tolerance 50% — annonce 1300/budget 1000 (=130%) → pas exclue", () => {
    const exc = estExclu(annonce, { budget_max: 1000, tolerance_budget_pct: 50 })
    expect(exc).toBe(false)
  })

  it("tolerance 0% — annonce 1100/budget 1000 → exclue (au-delà strict)", () => {
    const exc = estExclu({ ville: "paris", prix: 1100 }, { budget_max: 1000, tolerance_budget_pct: 0 })
    expect(exc).toBe(true)
  })

  it("tolerance 0% — annonce 1000/budget 1000 → pas exclue (égalité OK)", () => {
    const exc = estExclu({ ville: "paris", prix: 1000 }, { budget_max: 1000, tolerance_budget_pct: 0 })
    expect(exc).toBe(false)
  })
})

describe("V2.2 estExclu — dpe_min_actif filtre dur", () => {
  it("dpe_min=C + dpe_min_actif=true + annonce DPE F → exclue", () => {
    const exc = estExclu({ dpe: "F" }, { dpe_min: "C", dpe_min_actif: true })
    expect(exc).toBe(true)
  })

  it("dpe_min=C + dpe_min_actif=true + annonce DPE B → pas exclue (B mieux que C)", () => {
    const exc = estExclu({ dpe: "B" }, { dpe_min: "C", dpe_min_actif: true })
    expect(exc).toBe(false)
  })

  it("dpe_min=C + dpe_min_actif=false → pas exclue (DPE pas filtre dur)", () => {
    const exc = estExclu({ dpe: "F" }, { dpe_min: "C", dpe_min_actif: false })
    expect(exc).toBe(false)
  })

  it("dpe_min=C + dpe_min_actif absent → pas exclue (default OFF)", () => {
    const exc = estExclu({ dpe: "F" }, { dpe_min: "C" })
    expect(exc).toBe(false)
  })
})

// ─── V2.3 — Bonus geographique haversine (Paul 2026-04-27) ────────────────
describe("V2.3 calculerScore — bonus geographique rayon_recherche_km", () => {
  const baseProfil: Profil = { ville_souhaitee: "Paris", budget_max: 1500, surface_min: 30 }
  const baseAnnonce: Annonce = { prix: 1200, surface: 40 }

  it("rayon 20km + annonce Paris (=0km, distance/rayon=0) → bonus +50", () => {
    const sansRayon = calculerScore({ ...baseAnnonce, ville: "Paris" }, baseProfil)
    const avecRayon = calculerScore({ ...baseAnnonce, ville: "Paris" }, { ...baseProfil, rayon_recherche_km: 20 })
    expect(avecRayon - sansRayon).toBe(50)
  })

  it("rayon 20km + annonce Versailles (~17km de Paris, ratio 0.85) → bonus +10", () => {
    const sansRayon = calculerScore({ ...baseAnnonce, ville: "Versailles" }, baseProfil)
    const avecRayon = calculerScore({ ...baseAnnonce, ville: "Versailles" }, { ...baseProfil, rayon_recherche_km: 20 })
    // Versailles ~17km de Paris, ratio 0.85 → tier 0.8-1.0 → +10
    expect(avecRayon - sansRayon).toBe(10)
  })

  it("rayon 100km + annonce Paris (ratio ~0) → bonus +50", () => {
    const sansRayon = calculerScore({ ...baseAnnonce, ville: "Paris" }, baseProfil)
    const avecRayon = calculerScore({ ...baseAnnonce, ville: "Paris" }, { ...baseProfil, rayon_recherche_km: 100 })
    expect(avecRayon - sansRayon).toBe(50)
  })

  it("rayon 5km + annonce Lyon (>>5km de Paris) → bonus 0", () => {
    const sansRayon = calculerScore({ ...baseAnnonce, ville: "Lyon" }, baseProfil)
    const avecRayon = calculerScore({ ...baseAnnonce, ville: "Lyon" }, { ...baseProfil, rayon_recherche_km: 5 })
    expect(avecRayon - sansRayon).toBe(0)
  })

  it("rayon absent → pas de bonus geo (compat ancien profil)", () => {
    const score = calculerScore({ ...baseAnnonce, ville: "Paris" }, baseProfil)
    const scoreSimple = calculerScore({ ...baseAnnonce, ville: "Paris" }, { ...baseProfil })
    expect(score).toBe(scoreSimple)
  })

  it("rayon defini mais ville inconnue (pas dans CITY_COORDS) → pas de bonus", () => {
    const sansRayon = calculerScore({ ...baseAnnonce, ville: "VilleMartiale" }, baseProfil)
    const avecRayon = calculerScore({ ...baseAnnonce, ville: "VilleMartiale" }, { ...baseProfil, rayon_recherche_km: 20 })
    expect(avecRayon).toBe(sansRayon)
  })
})

// ──────────────────────────────────────────────
// V2.4 — Tri-state preferences equipements (jsonb)
// ──────────────────────────────────────────────
import { getEquipementPreference } from "./matching"

describe("V2.4 getEquipementPreference — tri-state equipements", () => {
  it("retourne la valeur explicite de preferences_equipements jsonb", () => {
    const profil: Profil = {
      preferences_equipements: { parking: "indispensable", balcon: "refuse" },
    } as Profil
    expect(getEquipementPreference(profil, "parking")).toBe("indispensable")
    expect(getEquipementPreference(profil, "balcon")).toBe("refuse")
  })

  it("fallback boolean legacy true → souhaite", () => {
    const profil: Profil = { parking: true } as Profil
    expect(getEquipementPreference(profil, "parking")).toBe("souhaite")
  })

  it("fallback boolean legacy false ou absent → indifferent", () => {
    expect(getEquipementPreference({ parking: false } as Profil, "parking")).toBe("indifferent")
    expect(getEquipementPreference({} as Profil, "parking")).toBe("indifferent")
  })

  it("preferences_equipements prime sur boolean legacy", () => {
    const profil: Profil = {
      parking: true,
      preferences_equipements: { parking: "refuse" },
    } as Profil
    expect(getEquipementPreference(profil, "parking")).toBe("refuse")
  })

  it("valeur invalide dans jsonb → fallback boolean legacy", () => {
    const profil: Profil = {
      parking: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preferences_equipements: { parking: "trololo" as any },
    } as Profil
    expect(getEquipementPreference(profil, "parking")).toBe("souhaite")
  })
})

describe("V2.4 calculerScore — bonus/malus tri-state equipements", () => {
  const baseProfil: Profil = {
    budget_max: 1500,
    surface_min: 40,
    pieces_min: 2,
  }
  const baseAnnonce: Annonce = {
    ville: "Paris",
    prix: 1400,
    surface: 50,
    pieces: 3,
  }

  it("indispensable parking + annonce avec parking → bonus equipement maximise", () => {
    const profil: Profil = { ...baseProfil, preferences_equipements: { parking: "indispensable" } }
    const sansParking = calculerScore({ ...baseAnnonce, parking: true }, baseProfil)
    const avecIndispensable = calculerScore({ ...baseAnnonce, parking: true }, profil)
    // indispensable+present = 50+25 = 75 vs legacy "indifferent" = 70 → diff = +5
    expect(avecIndispensable - sansParking).toBe(5)
  })

  it("indispensable parking + annonce sans parking → forte penalite", () => {
    const profil: Profil = { ...baseProfil, preferences_equipements: { parking: "indispensable" } }
    const refScore = calculerScore({ ...baseAnnonce, parking: false }, baseProfil)
    const indispScore = calculerScore({ ...baseAnnonce, parking: false }, profil)
    // indispensable+absent = 50-20 = 30 vs legacy "indifferent" = 70 → diff = -40
    expect(indispScore - refScore).toBe(-40)
  })

  it("refuse balcon + annonce avec balcon → malus", () => {
    const profil: Profil = { ...baseProfil, preferences_equipements: { balcon: "refuse" } }
    const refScore = calculerScore({ ...baseAnnonce, balcon: true }, baseProfil)
    const refusScore = calculerScore({ ...baseAnnonce, balcon: true }, profil)
    // refuse+present = 50-15 = 35 vs legacy "indifferent" = 70 → diff = -35
    expect(refusScore - refScore).toBe(-35)
  })

  it("refuse balcon + annonce sans balcon → leger bonus", () => {
    const profil: Profil = { ...baseProfil, preferences_equipements: { balcon: "refuse" } }
    const refScore = calculerScore({ ...baseAnnonce, balcon: false }, baseProfil)
    const refusScore = calculerScore({ ...baseAnnonce, balcon: false }, profil)
    // refuse+absent = 50+5 = 55 vs legacy "indifferent" = 70 → diff = -15
    // (legacy neutre est plus favorable car on n'a rien souhaite)
    expect(refusScore - refScore).toBe(-15)
  })

  it("toutes prefs indifferent + annonce sans equipement → score neutre 70 (compat legacy)", () => {
    const profil: Profil = {
      ...baseProfil,
      preferences_equipements: {
        parking: "indifferent", balcon: "indifferent", terrasse: "indifferent",
        jardin: "indifferent", cave: "indifferent", fibre: "indifferent", ascenseur: "indifferent",
      },
    }
    const score = calculerScore(baseAnnonce, profil)
    const scoreLegacy = calculerScore(baseAnnonce, baseProfil)
    expect(score).toBe(scoreLegacy)
  })

  it("preferences_equipements null → fallback legacy boolean", () => {
    const profil: Profil = { ...baseProfil, parking: true, preferences_equipements: null }
    const annonce: Annonce = { ...baseAnnonce, parking: true }
    const score = calculerScore(annonce, profil)
    const scoreSansPref = calculerScore(annonce, { ...baseProfil, parking: true })
    expect(score).toBe(scoreSansPref)
  })
})
