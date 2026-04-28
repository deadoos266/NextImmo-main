// =====================
// KeyMatch — Matching Engine v3.0
// Score sur 1000 — Production Premium
// =====================

import { getCityCoords, haversineKm } from "./cityCoords"

// Normalisation defensive des valeurs booleennes venant de la DB.
// Supabase peut renvoyer boolean, null, ou (legacy) string "true"/"false".
// undefined = info absente (ni oui, ni non) — score neutre.
function toBool(v: unknown): boolean | undefined {
  if (v === true || v === 1 || v === "true" || v === "t" || v === "1") return true
  if (v === false || v === 0 || v === "false" || v === "f" || v === "0") return false
  return undefined
}

// V2.4 — preference tri-state par equipement.
type EquipPref = "indispensable" | "souhaite" | "indifferent" | "refuse"

function normalizePref(v: unknown): EquipPref | undefined {
  if (v === "indispensable" || v === "souhaite" || v === "indifferent" || v === "refuse") return v
  return undefined
}

/**
 * Lit la preference tri-state d'un equipement pour un profil donne.
 * Priorite : preferences_equipements jsonb > legacy boolean > "indifferent".
 *
 * Compat : un user qui n'a pas encore configure preferences_equipements
 * verra ses anciens booleans interpretes comme "souhaite" (true) ou
 * "indifferent" (false/undefined). Aucune regression silencieuse.
 *
 * Exporte pour tests + UI picker EquipementPreferencePicker (V2.6).
 */
export function getEquipementPreference(profil: Profil, key: string): EquipPref {
  const explicit = profil.preferences_equipements?.[key]
  const norm = normalizePref(explicit)
  if (norm) return norm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyVal = (profil as any)[key]
  if (toBool(legacyVal) === true) return "souhaite"
  return "indifferent"
}

export interface Profil {
  ville_souhaitee?: string
  mode_localisation?: "strict" | "souple"
  budget_max?: number
  surface_min?: number
  pieces_min?: number
  chambres_min?: number
  rez_de_chaussee_ok?: boolean
  animaux?: boolean
  meuble?: boolean
  parking?: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  cave?: boolean
  fibre?: boolean
  ascenseur?: boolean
  dpe_min?: string
  // V2.2 (Paul 2026-04-27) — nouveaux champs matching v2 (migration 026).
  /** Si true, dpe_min est utilise comme filtre dur (annonces pire DPE
   *  exclues). Si false ou absent, le DPE est juste un bonus de score. */
  dpe_min_actif?: boolean
  /** Tolerance budget en pourcentage (default 20). Remplace le hardcode
   *  1.20 dans estExclu. User-controlled via slider /profil. */
  tolerance_budget_pct?: number
  /** Rayon recherche km depuis ville_souhaitee. Si defini, score bonus
   *  geographique (haversine). Lu en V2.3. */
  rayon_recherche_km?: number | null
  /** Tri-state per equipement (V2.4). Lu via getEquipementPreference. */
  preferences_equipements?: Record<string, "indispensable" | "souhaite" | "indifferent" | "refuse"> | null
  // R10.6 — dérivés du dossier locataire, lus depuis table `profils`.
  // `fumeur` / `nb_occupants` existent depuis la baseline ; `date_naissance` depuis 007.
  // `date_naissance` → on calcule l'âge à la volée, pour comparaison avec annonce.age_min/age_max.
  fumeur?: boolean
  nb_occupants?: number
  date_naissance?: string | null
  // Critères discriminants protégés par la loi — conservés en interface pour
  // typage, mais STRICTEMENT IGNORÉS par le matching (voir tests).
  nb_enfants?: number
  situation_familiale?: string
  nationalite?: string
  religion?: string
  orientation?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preferences_implicites?: any
}

export interface Annonce {
  ville?: string
  prix?: number
  surface?: number
  pieces?: number
  chambres?: number
  etage?: string | number
  animaux?: boolean
  meuble?: boolean
  parking?: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  cave?: boolean
  fibre?: boolean
  ascenseur?: boolean
  dpe?: string
  // R10.6 — critères v2, non-discriminants, bonus matching uniquement.
  age_min?: number | null
  age_max?: number | null
  max_occupants?: number | null
  animaux_politique?: "indifferent" | "oui" | "non" | null
  fumeur_politique?: "indifferent" | "oui" | "non" | null
  equipements_extras?: Record<string, boolean> | null
}

// R10.6 — calcule l'âge en années depuis date_naissance ISO. Renvoie undefined
// si format invalide ou date future / trop ancienne.
function computeAge(dateNaissance?: string | null): number | undefined {
  if (!dateNaissance) return undefined
  const ts = Date.parse(dateNaissance)
  if (Number.isNaN(ts)) return undefined
  const diffMs = Date.now() - ts
  if (diffMs < 0) return undefined
  const years = Math.floor(diffMs / (365.25 * 24 * 3600 * 1000))
  if (years < 0 || years > 130) return undefined
  return years
}

// ──────────────────────────────────────────────
// FILTRES DURS — bien exclu si true
// ──────────────────────────────────────────────
export function estExclu(annonce: Annonce, profil: Profil): boolean {
  if (!profil) return false

  // Ville stricte
  if (profil.mode_localisation === "strict" && profil.ville_souhaitee && annonce.ville) {
    const vA = annonce.ville.toLowerCase()
    const vP = profil.ville_souhaitee.toLowerCase()
    if (!vA.includes(vP) && !vP.includes(vA)) return true
  }

  // Budget depasse au-dela de la tolerance user-controlled (V2.2 Paul 2026-04-27).
  // Default 20% si tolerance_budget_pct absent (compat ancien profil).
  if (profil.budget_max && annonce.prix) {
    const tolPct = typeof profil.tolerance_budget_pct === "number" && profil.tolerance_budget_pct >= 0
      ? profil.tolerance_budget_pct
      : 20
    if (annonce.prix > profil.budget_max * (1 + tolPct / 100)) return true
  }

  // DPE filtre dur (V2.2) — uniquement si dpe_min_actif=true et dpe_min defini.
  // Ordre des classes : A (meilleur) → G (pire). On compare via index.
  if (profil.dpe_min_actif === true && profil.dpe_min && annonce.dpe) {
    const order = ["A", "B", "C", "D", "E", "F", "G"]
    const seuil = order.indexOf(profil.dpe_min.toUpperCase())
    const annonceIdx = order.indexOf(annonce.dpe.toUpperCase())
    if (seuil >= 0 && annonceIdx >= 0 && annonceIdx > seuil) return true
  }

  // Animaux refusés — prise en compte du nouveau champ `animaux_politique`
  // (R10.6) s'il est défini ; sinon fallback sur le boolean legacy.
  if (toBool(profil.animaux) === true) {
    if (annonce.animaux_politique === "non") return true
    if (annonce.animaux_politique == null && toBool(annonce.animaux) === false) return true
  }

  // Rez-de-chaussée refusé — si profil a coché "PAS de RDC" et annonce au RDC,
  // exclu. On considère RDC les valeurs : "0", "RDC", "rdc", "Rez-de-chaussée".
  if (toBool(profil.rez_de_chaussee_ok) === false) {
    const etage = String(annonce.etage ?? "").toLowerCase().trim()
    if (etage && (etage === "0" || etage.includes("rdc") || etage.includes("rez"))) {
      return true
    }
  }

  return false
}

// ──────────────────────────────────────────────
// SCORE DE MATCHING — sur 1000
// ──────────────────────────────────────────────
export function calculerScore(annonce: Annonce, profil: Profil): number {
  // FIX #4 — profil vide = score neutre visible
  if (!profil) return 500

  let score = 0
  let facteurCoherence = 1.0

  // ── BUDGET (300 pts max, cap bonus à 330) ─────
  if (profil.budget_max && annonce.prix) {
    const ecart = (annonce.prix - profil.budget_max) / profil.budget_max
    let s = 0

    if (ecart < -0.30) {
      s = 330 // cap — évite que le prix bas écrase tout
    } else if (ecart <= 0) {
      // Fonction continue : légère progression quand on est sous budget
      s = 280 + 50 * (1 - (ecart + 0.30) / 0.30)
    } else if (ecart <= 0.20) {
      // Décroissance convexe douce
      s = 280 * Math.pow(1 - ecart / 0.20, 1.5)
    } else {
      s = 0
    }
    score += Math.min(Math.round(s), 330)
  } else {
    score += 150 // neutre si non renseigné
  }

  // ── SURFACE (270 pts) ─────────────────────────
  if (profil.surface_min && annonce.surface) {
    const ratio = annonce.surface / profil.surface_min
    let s = 0

    if (ratio >= 1.40) {
      s = 270
    } else if (ratio >= 1.00) {
      s = 200 + 70 * (ratio - 1.00) / 0.40
    } else {
      // FIX #1 — exposant 2.5 au lieu de 2 : biens trop petits plus pénalisés
      s = 200 * Math.pow(ratio, 2.5)
    }
    score += Math.round(s)

    // Cohérence fluide — FIX optionnel premium
    const manqueSurface = Math.max(0, 1 - ratio)
    facteurCoherence *= 1 - Math.min(0.25, manqueSurface)

  } else {
    score += 135 // neutre
  }

  // ── PIÈCES (150 pts) ──────────────────────────
  if (profil.pieces_min && annonce.pieces) {
    const diff = annonce.pieces - profil.pieces_min
    let s = 0

    if (diff >= 1)       s = 150
    else if (diff === 0)  s = 140
    else if (diff === -1) s = 91
    else if (diff === -2) s = 42
    // FIX #2 — était 14, trop brutal entre -2 et -3
    else                  s = 28

    score += s

    // Cohérence : surface ET pièces insuffisantes
    if (diff < -1 && profil.surface_min && annonce.surface) {
      const ratio = annonce.surface / profil.surface_min
      if (ratio < 0.80) {
        facteurCoherence = Math.min(facteurCoherence, 0.82)
      }
    }
  } else {
    score += 75 // neutre
  }

  // ── CHAMBRES (50 pts) ─────────────────────────
  // Bonus si l'annonce a au moins autant de chambres que demandé, malus sinon.
  if (profil.chambres_min && annonce.chambres !== undefined && annonce.chambres !== null) {
    const diff = Number(annonce.chambres) - Number(profil.chambres_min)
    if (diff >= 1)       score += 50
    else if (diff === 0)  score += 45
    else if (diff === -1) score += 25
    else                  score += 10
  } else {
    score += 30 // neutre
  }

  // ── MEUBLÉ (100 pts) ──────────────────────────
  const profilMeuble = toBool(profil.meuble)
  const annonceMeuble = toBool(annonce.meuble)
  if (profilMeuble !== undefined && annonceMeuble !== undefined) {
    score += profilMeuble === annonceMeuble ? 100 : 40
  } else {
    score += 70 // neutre
  }

  // ── ÉQUIPEMENTS (100 pts, plancher 0) ─────────
  // V2.4 — tri-state per equipement via preferences_equipements jsonb.
  // Fallback boolean legacy preserve. Bareme :
  //   indispensable + present : +25 ; absent : -20 ; inconnu : -5
  //   souhaite      + present : +10 ; absent :   0 ; inconnu : +2
  //   refuse        + present : -15 ; absent :  +5 ; inconnu :  0
  //   indifferent   : 0 (skip)
  // Score = clamp(0, 100, 50 + somme).
  // Compat : si toutes prefs == indifferent → 70 (legacy "rien souhaité").
  const EQUIP_KEYS = ["parking", "balcon", "terrasse", "jardin", "cave", "fibre", "ascenseur"] as const
  const equips = EQUIP_KEYS.map(key => ({
    key,
    pref: getEquipementPreference(profil, key),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    has: toBool((annonce as any)[key]),
  }))
  const actionnable = equips.filter(e => e.pref !== "indifferent")
  if (actionnable.length === 0) {
    score += 70
  } else {
    const hasAnyInfo = actionnable.some(e => e.has !== undefined)
    if (!hasAnyInfo) {
      score += 50
    } else {
      let raw = 0
      for (const { pref, has } of actionnable) {
        if (pref === "indispensable") {
          if (has === true) raw += 25
          else if (has === false) raw -= 20
          else raw -= 5
        } else if (pref === "souhaite") {
          if (has === true) raw += 10
          else if (has === undefined) raw += 2
        } else if (pref === "refuse") {
          if (has === true) raw -= 15
          else if (has === false) raw += 5
        }
      }
      score += Math.max(0, Math.min(100, 50 + raw))
    }
  }

  // ── DPE (50 pts) ──────────────────────────────
  const dpePoints: Record<string, number> = {
    A: 50, B: 42, C: 34, D: 22, E: 12, F: 4, G: 0
  }
  if (annonce.dpe && dpePoints[annonce.dpe] !== undefined) {
    score += dpePoints[annonce.dpe]
  } else {
    score += 25 // neutre
  }

  // ── CRITÈRES CANDIDATS v2 (R10.6) ─────────────
  // Bonus / petits malus très ciblés. Les critères protégés par la loi
  // (nb_enfants, situation_familiale, nationalité, origine, religion,
  // orientation) ne sont PAS lus ici — ils n'influent jamais le score.
  let criteresBonus = 0

  // Âge candidat — bonus uniquement si dans la borne. Hors borne = 0 (pas de malus).
  const age = computeAge(profil.date_naissance)
  if (age !== undefined && (annonce.age_min != null || annonce.age_max != null)) {
    const okMin = annonce.age_min == null || age >= annonce.age_min
    const okMax = annonce.age_max == null || age <= annonce.age_max
    if (okMin && okMax) criteresBonus += 20
  }

  // Nombre d'occupants — bonus si foyer ≤ plafond annonce. Sinon 0.
  if (annonce.max_occupants != null && typeof profil.nb_occupants === "number") {
    if (profil.nb_occupants <= annonce.max_occupants) criteresBonus += 20
  }

  // Fumeur — politique explicite uniquement.
  if (annonce.fumeur_politique === "non" && toBool(profil.fumeur) === true) {
    criteresBonus -= 15 // malus léger mais explicite (propriétaire strict)
  } else if (annonce.fumeur_politique === "oui" && toBool(profil.fumeur) === true) {
    criteresBonus += 10
  }

  // Animaux — si politique oui + locataire a animaux : bonus léger
  if (annonce.animaux_politique === "oui" && toBool(profil.animaux) === true) {
    criteresBonus += 10
  }

  score += criteresBonus

  // ── BONUS GEOGRAPHIQUE (V2.3 Paul 2026-04-27) ──
  // Si le profil a un rayon_recherche_km defini ET sa ville_souhaitee a
  // des coords ET l'annonce.ville aussi → bonus selon distance.
  // - Distance <= 20% du rayon : +50 (parfait, in town ou tres proche)
  // - <= 50% : +35
  // - <= 80% : +20
  // - <= 100% : +10 (limite acceptable)
  // - > 100% : 0 (hors rayon, mais pas exclu — l'user peut quand meme voir)
  // Pas de malus : on considere que si l'annonce est passee les filtres ville,
  // c'est qu'elle est dans la zone. Le bonus prime juste la proximite.
  if (typeof profil.rayon_recherche_km === "number" && profil.rayon_recherche_km > 0
      && profil.ville_souhaitee && annonce.ville) {
    const sourceCoords = getCityCoords(profil.ville_souhaitee)
    const targetCoords = getCityCoords(annonce.ville)
    if (sourceCoords && targetCoords) {
      const distanceKm = haversineKm(sourceCoords, targetCoords)
      const ratioDist = distanceKm / profil.rayon_recherche_km
      let geoBonus = 0
      if (ratioDist <= 0.2) geoBonus = 50
      else if (ratioDist <= 0.5) geoBonus = 35
      else if (ratioDist <= 0.8) geoBonus = 20
      else if (ratioDist <= 1.0) geoBonus = 10
      score += geoBonus
    }
  }

  // ── COEFFICIENT DE COHÉRENCE ──────────────────
  score = Math.round(score * facteurCoherence)

  // ── BONUS ADAPTATIF — FIX #3 ──────────────────
  // Multiplicateur au lieu d'addition directe
  if (profil.preferences_implicites) {
    try {
      const prefs =
        typeof profil.preferences_implicites === "string"
          ? JSON.parse(profil.preferences_implicites)
          : profil.preferences_implicites

      let bonus = 0
      if (toBool(prefs.prefere_meuble)    && toBool(annonce.meuble))                               bonus += 0.03
      if (toBool(prefs.prefere_exterieur) && (toBool(annonce.balcon) || toBool(annonce.terrasse))) bonus += 0.03
      if (toBool(prefs.prefere_parking)   && toBool(annonce.parking))                              bonus += 0.02

      score = score * (1 + bonus)
    } catch {
      // Silencieux — préférences implicites optionnelles
    }
  }

  // FIX #5 — Sécurité globale
  return Math.max(0, Math.min(Math.round(score), 1000))
}

// ──────────────────────────────────────────────
// LABEL — affichage selon score
// ──────────────────────────────────────────────
export function labelScore(score: number) {
  if (score >= 900) return { label: "Excellent match", color: "#16a34a", bg: "#dcfce7" }
  if (score >= 750) return { label: "Très bon match",  color: "#16a34a", bg: "#dcfce7" }
  if (score >= 600) return { label: "Bon match",       color: "#ea580c", bg: "#ffedd5" }
  if (score >= 400) return { label: "Match moyen",     color: "#ca8a04", bg: "#fef9c3" }
  return               { label: "Faible match",        color: "#6b7280", bg: "#f3f4f6" }
}

// ──────────────────────────────────────────────
// EXPLICATION — raisons affichées sur la fiche
// ──────────────────────────────────────────────
export function expliquerScore(annonce: Annonce, profil: Profil): string[] {
  if (!profil) return []
  const raisons: string[] = []

  if (profil.budget_max && annonce.prix) {
    const ecart = ((annonce.prix - profil.budget_max) / profil.budget_max * 100).toFixed(0)
    if (annonce.prix <= profil.budget_max)
      raisons.push(`✓ Dans votre budget (${annonce.prix} € ≤ ${profil.budget_max} €)`)
    else
      raisons.push(`✗ Dépasse votre budget de ${ecart}% (${annonce.prix} € vs ${profil.budget_max} €)`)
  }

  if (profil.surface_min && annonce.surface) {
    if (annonce.surface >= profil.surface_min)
      raisons.push(`✓ Surface suffisante (${annonce.surface} m²)`)
    else
      raisons.push(`✗ Surface en dessous de votre minimum (${annonce.surface} m² vs ${profil.surface_min} m² souhaités)`)
  }

  if (profil.pieces_min && annonce.pieces) {
    const diff = annonce.pieces - profil.pieces_min
    if (diff >= 0)
      raisons.push(`✓ ${annonce.pieces} pièce${annonce.pieces > 1 ? "s" : ""} — correspondance parfaite`)
    else
      raisons.push(`✗ ${Math.abs(diff)} pièce${Math.abs(diff) > 1 ? "s" : ""} en moins par rapport à votre souhait`)
  }

  if (toBool(profil.animaux) === true) {
    raisons.push(toBool(annonce.animaux)
      ? "✓ Animaux acceptés"
      : "✗ Animaux refusés par le propriétaire")
  }

  const pMeuble = toBool(profil.meuble)
  const aMeuble = toBool(annonce.meuble)
  if (pMeuble !== undefined && aMeuble !== undefined) {
    if (pMeuble === aMeuble)
      raisons.push(`✓ ${pMeuble ? "Meublé" : "Non meublé"} — comme souhaité`)
    else
      raisons.push(`✗ ${aMeuble ? "Meublé" : "Non meublé"} — vous préférez l'inverse`)
  }

  return raisons
}

// ──────────────────────────────────────────────
// V2.8 — Breakdown par categorie (pour ScoreBlock detaille)
// ──────────────────────────────────────────────
/**
 * Renvoie une decomposition par categorie du score : Budget, Surface, Pieces,
 * Meuble, Equipements, DPE. Pour chaque categorie : pts obtenus, pts max,
 * et un statut (match / partiel / miss / neutre).
 *
 * Utilise par /annonces/[id] ScoreBlock pour afficher le breakdown visible
 * par defaut + suggestions actionnables.
 */
export type BreakdownItem = {
  key: string
  label: string
  pts: number
  max: number
  status: "match" | "partiel" | "miss" | "neutre"
}

export function breakdownScore(annonce: Annonce, profil: Profil): BreakdownItem[] {
  if (!profil) return []
  const items: BreakdownItem[] = []

  // Budget — max 330 (cap), neutre 150.
  if (profil.budget_max && annonce.prix) {
    const ecart = (annonce.prix - profil.budget_max) / profil.budget_max
    let pts = 0
    if (ecart < -0.30) pts = 330
    else if (ecart <= 0) pts = Math.round(280 + 50 * (1 - (ecart + 0.30) / 0.30))
    else if (ecart <= 0.20) pts = Math.round(280 * Math.pow(1 - ecart / 0.20, 1.5))
    items.push({
      key: "budget", label: "Budget", pts, max: 330,
      status: pts >= 280 ? "match" : pts >= 100 ? "partiel" : "miss",
    })
  } else {
    items.push({ key: "budget", label: "Budget", pts: 150, max: 330, status: "neutre" })
  }

  // Surface — max 270.
  if (profil.surface_min && annonce.surface) {
    const ratio = annonce.surface / profil.surface_min
    let pts = 0
    if (ratio >= 1.40) pts = 270
    else if (ratio >= 1.00) pts = Math.round(200 + 70 * (ratio - 1.00) / 0.40)
    else pts = Math.round(200 * Math.pow(ratio, 2.5))
    items.push({
      key: "surface", label: "Surface", pts, max: 270,
      status: pts >= 200 ? "match" : pts >= 100 ? "partiel" : "miss",
    })
  } else {
    items.push({ key: "surface", label: "Surface", pts: 135, max: 270, status: "neutre" })
  }

  // Pieces — max 150.
  if (profil.pieces_min && annonce.pieces) {
    const diff = annonce.pieces - profil.pieces_min
    let pts = 0
    if (diff >= 1) pts = 150
    else if (diff === 0) pts = 140
    else if (diff === -1) pts = 91
    else if (diff === -2) pts = 42
    else pts = 28
    items.push({
      key: "pieces", label: "Pièces", pts, max: 150,
      status: pts >= 140 ? "match" : pts >= 80 ? "partiel" : "miss",
    })
  } else {
    items.push({ key: "pieces", label: "Pièces", pts: 75, max: 150, status: "neutre" })
  }

  // Meuble — max 100.
  const pMeuble = toBool(profil.meuble)
  const aMeuble = toBool(annonce.meuble)
  if (pMeuble !== undefined && aMeuble !== undefined) {
    const pts = pMeuble === aMeuble ? 100 : 40
    items.push({
      key: "meuble", label: "Meublé", pts, max: 100,
      status: pts === 100 ? "match" : "partiel",
    })
  } else {
    items.push({ key: "meuble", label: "Meublé", pts: 70, max: 100, status: "neutre" })
  }

  // Equipements — max 100. Reutilise la logique tri-state de calculerScore.
  const EQUIP_KEYS = ["parking", "balcon", "terrasse", "jardin", "cave", "fibre", "ascenseur"] as const
  const equips = EQUIP_KEYS.map(key => ({
    pref: getEquipementPreference(profil, key),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    has: toBool((annonce as any)[key]),
  }))
  const actionnable = equips.filter(e => e.pref !== "indifferent")
  let equipPts: number
  let equipStatus: BreakdownItem["status"] = "neutre"
  if (actionnable.length === 0) {
    equipPts = 70
  } else {
    const hasAnyInfo = actionnable.some(e => e.has !== undefined)
    if (!hasAnyInfo) {
      equipPts = 50
      equipStatus = "partiel"
    } else {
      let raw = 0
      for (const { pref, has } of actionnable) {
        if (pref === "indispensable") {
          if (has === true) raw += 25
          else if (has === false) raw -= 20
          else raw -= 5
        } else if (pref === "souhaite") {
          if (has === true) raw += 10
          else if (has === undefined) raw += 2
        } else if (pref === "refuse") {
          if (has === true) raw -= 15
          else if (has === false) raw += 5
        }
      }
      equipPts = Math.max(0, Math.min(100, 50 + raw))
      equipStatus = equipPts >= 80 ? "match" : equipPts >= 40 ? "partiel" : "miss"
    }
  }
  items.push({ key: "equipements", label: "Équipements", pts: equipPts, max: 100, status: equipStatus })

  // DPE — max 50.
  const dpePoints: Record<string, number> = { A: 50, B: 42, C: 34, D: 22, E: 12, F: 4, G: 0 }
  if (annonce.dpe && dpePoints[annonce.dpe] !== undefined) {
    const pts = dpePoints[annonce.dpe]
    items.push({
      key: "dpe", label: "DPE", pts, max: 50,
      status: pts >= 34 ? "match" : pts >= 12 ? "partiel" : "miss",
    })
  } else {
    items.push({ key: "dpe", label: "DPE", pts: 25, max: 50, status: "neutre" })
  }

  return items
}

/**
 * V2.8 — Suggestions actionnables pour gagner des points sur ce match.
 * Renvoie 0..N suggestions priorisees par impact estime.
 *
 * Ne touche pas au profil de l'utilisateur — c'est juste un coup de pouce
 * UI : "tu peux gagner +X pts en faisant Y".
 */
export type Suggestion = {
  hint: string
  impactPts: number  // estimation grossiere
}

export function suggestImprovements(annonce: Annonce, profil: Profil): Suggestion[] {
  if (!profil) return []
  const out: Suggestion[] = []

  // Budget : si depasse, suggerer d'augmenter la tolerance.
  if (profil.budget_max && annonce.prix && annonce.prix > profil.budget_max) {
    const tolPct = typeof profil.tolerance_budget_pct === "number" ? profil.tolerance_budget_pct : 20
    const ecartPct = Math.ceil(((annonce.prix - profil.budget_max) / profil.budget_max) * 100)
    if (ecartPct > tolPct) {
      out.push({
        hint: `Augmentez votre tolérance budget à ${ecartPct}% pour ne plus exclure ce type d'annonces.`,
        impactPts: 50,
      })
    }
  }

  // Rayon : si pas defini, suggerer de l'activer si annonce hors ville exacte.
  if (!profil.rayon_recherche_km && profil.ville_souhaitee && annonce.ville
      && profil.ville_souhaitee.toLowerCase() !== annonce.ville.toLowerCase()) {
    const sourceCoords = getCityCoords(profil.ville_souhaitee)
    const targetCoords = getCityCoords(annonce.ville)
    if (sourceCoords && targetCoords) {
      const distanceKm = Math.round(haversineKm(sourceCoords, targetCoords))
      out.push({
        hint: `Définissez un rayon de recherche d'au moins ${Math.max(distanceKm + 5, 10)} km pour valoriser cette annonce.`,
        impactPts: 35,
      })
    }
  }

  // Equipement indispensable manquant : suggerer de passer en souhaite.
  const EQUIP_KEYS = ["parking", "balcon", "terrasse", "jardin", "cave", "fibre", "ascenseur"] as const
  for (const key of EQUIP_KEYS) {
    const pref = getEquipementPreference(profil, key)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const has = toBool((annonce as any)[key])
    if (pref === "indispensable" && has === false) {
      out.push({
        hint: `Cette annonce n'a pas de ${key}. Passez ce critère en "Souhaité" pour ne plus le pénaliser fortement.`,
        impactPts: 45,
      })
      break  // Une seule suggestion equipement
    }
  }

  // DPE filtre dur actif + annonce DPE pire : suggerer d'assouplir.
  if (profil.dpe_min_actif && profil.dpe_min && annonce.dpe) {
    const order = ["A", "B", "C", "D", "E", "F", "G"]
    const seuil = order.indexOf(profil.dpe_min.toUpperCase())
    const annonceIdx = order.indexOf(annonce.dpe.toUpperCase())
    if (seuil >= 0 && annonceIdx >= 0 && annonceIdx > seuil) {
      out.push({
        hint: `Cette annonce a un DPE ${annonce.dpe} (vous avez fixé ${profil.dpe_min} comme strict). Désactivez le filtre DPE strict pour la voir.`,
        impactPts: 0,  // ne change pas le score, juste la visibilite
      })
    }
  }

  return out.slice(0, 3)  // max 3 suggestions
}
