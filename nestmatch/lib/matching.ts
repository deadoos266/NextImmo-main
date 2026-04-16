// =====================
// NestMatch — Matching Engine v3.0
// Score sur 1000 — Production Premium
// =====================

// Normalisation defensive des valeurs booleennes venant de la DB.
// Supabase peut renvoyer boolean, null, ou (legacy) string "true"/"false".
// undefined = info absente (ni oui, ni non) — score neutre.
function toBool(v: unknown): boolean | undefined {
  if (v === true || v === 1 || v === "true" || v === "t" || v === "1") return true
  if (v === false || v === 0 || v === "false" || v === "f" || v === "0") return false
  return undefined
}

export interface Profil {
  ville_souhaitee?: string
  mode_localisation?: "strict" | "souple"
  budget_max?: number
  surface_min?: number
  pieces_min?: number
  animaux?: boolean
  meuble?: boolean
  parking?: boolean
  balcon?: boolean
  terrasse?: boolean
  cave?: boolean
  fibre?: boolean
  ascenseur?: boolean
  dpe_min?: string
  preferences_implicites?: any
}

export interface Annonce {
  ville?: string
  prix?: number
  surface?: number
  pieces?: number
  animaux?: boolean
  meuble?: boolean
  parking?: boolean
  balcon?: boolean
  terrasse?: boolean
  cave?: boolean
  fibre?: boolean
  ascenseur?: boolean
  dpe?: string
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

  // Budget dépassé de plus de 20%
  if (profil.budget_max && annonce.prix) {
    if (annonce.prix > profil.budget_max * 1.20) return true
  }

  // Animaux refusés
  if (toBool(profil.animaux) === true && toBool(annonce.animaux) === false) return true

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

  // ── MEUBLÉ (100 pts) ──────────────────────────
  const profilMeuble = toBool(profil.meuble)
  const annonceMeuble = toBool(annonce.meuble)
  if (profilMeuble !== undefined && annonceMeuble !== undefined) {
    score += profilMeuble === annonceMeuble ? 100 : 40
  } else {
    score += 70 // neutre
  }

  // ── ÉQUIPEMENTS (100 pts, plancher 40) ────────
  const equips = [
    { want: toBool(profil.parking),   has: toBool(annonce.parking) },
    { want: toBool(profil.balcon),    has: toBool(annonce.balcon) },
    { want: toBool(profil.terrasse),  has: toBool(annonce.terrasse) },
    { want: toBool(profil.cave),      has: toBool(annonce.cave) },
    { want: toBool(profil.fibre),     has: toBool(annonce.fibre) },
    { want: toBool(profil.ascenseur), has: toBool(annonce.ascenseur) },
  ]
  const wanted = equips.filter(e => e.want === true)
  if (wanted.length === 0) {
    score += 70 // neutre — rien souhaité
  } else {
    const hasInfo = wanted.some(e => e.has !== undefined)
    if (!hasInfo) {
      score += 50 // annonce ne renseigne rien → léger doute
    } else {
      const matched = wanted.filter(e => e.has === true).length
      // Plancher à 40 — équipements jamais éliminatoires
      score += Math.round(40 + 60 * (matched / wanted.length))
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
