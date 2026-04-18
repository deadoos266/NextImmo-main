/**
 * Screening automatique des candidats côté propriétaire.
 *
 * À partir du profil du candidat (table `profils`) et du loyer demandé,
 * calcule un score de qualité 0-100 + un résumé 1-ligne + un code couleur.
 * Permet au proprio de trier ses candidatures en 5 secondes sans ouvrir
 * chaque dossier.
 *
 * NE REMPLACE PAS la validation manuelle — c'est une aide à la décision.
 *
 * Dimensions évaluées (total 100) :
 * - Solvabilité (règle 33% : revenus ≥ 3× loyer) : 0-45
 * - Situation professionnelle stable : 0-25
 * - Garant présent : 0-20
 * - Complétude du profil : 0-10
 */

export interface ScreeningProfil {
  revenus_mensuels?: number | string | null
  situation_pro?: string | null
  garant?: boolean | null
  type_garant?: string | null
  nom?: string | null
  telephone?: string | null
  ville_souhaitee?: string | null
  budget_max?: number | string | null
  profil_locataire?: string | null
}

export interface ScreeningResult {
  score: number                 // 0-100
  tier: "excellent" | "bon" | "moyen" | "faible" | "incomplet"
  color: string                 // couleur texte
  bg: string                    // couleur fond
  border: string                // couleur bordure
  label: string                 // "Excellent", "Bon candidat", etc.
  summary: string               // "CDI · 2850 €/mois · Garant · 3.2× loyer"
  flags: string[]               // ["Aucun revenu renseigné", "Pas de garant"] etc.
  ratioSolvabilite: number | null // revenus / loyer
}

const SITUATION_PRO_STABLE = new Set([
  "CDI", "CDI cadre", "Fonctionnaire", "Retraité",
])
const SITUATION_PRO_MOYENNE = new Set([
  "CDD", "Indépendant", "Freelance", "Intérim", "Intermittent",
  "Profession libérale", "Chef d'entreprise",
])
const SITUATION_PRO_FAIBLE = new Set([
  "Étudiant", "Etudiant", "Apprenti", "Alternance",
  "Sans emploi", "Au chômage", "Chômage", "Demandeur d'emploi",
])

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/**
 * Formatte un résumé compact 1-ligne des infos clés.
 */
function buildSummary(p: ScreeningProfil, ratio: number | null): string {
  const parts: string[] = []
  if (p.situation_pro) parts.push(String(p.situation_pro))
  const revenus = parseNumber(p.revenus_mensuels)
  if (revenus !== null) parts.push(`${revenus.toLocaleString("fr-FR")} €/mois`)
  if (p.garant === true) parts.push(p.type_garant ? `Garant ${p.type_garant.toLowerCase()}` : "Garant")
  if (ratio !== null) parts.push(`${ratio.toFixed(1)}× loyer`)
  return parts.join(" · ") || "Profil incomplet"
}

/**
 * Calcule le screening d'un candidat.
 * @param profil Le profil locataire du candidat (depuis `profils`)
 * @param loyer Le loyer mensuel du bien visé (charges incluses recommandé)
 */
export function computeScreening(profil: ScreeningProfil | null | undefined, loyer: number | null | undefined): ScreeningResult {
  const flags: string[] = []

  if (!profil) {
    return {
      score: 0,
      tier: "incomplet",
      color: "#6b7280",
      bg: "#f3f4f6",
      border: "#e5e7eb",
      label: "Dossier non rempli",
      summary: "Le candidat n'a pas encore rempli son dossier locataire",
      flags: ["Dossier vide"],
      ratioSolvabilite: null,
    }
  }

  const revenus = parseNumber(profil.revenus_mensuels)
  const loyerNum = parseNumber(loyer)
  const ratio = revenus !== null && loyerNum !== null && loyerNum > 0 ? revenus / loyerNum : null

  // ─── Solvabilité (0-45) ─────────────────────────────────
  let solvabiliteScore = 0
  if (ratio === null) {
    flags.push(revenus === null ? "Revenus non renseignés" : "Loyer inconnu")
  } else if (ratio >= 3) {
    solvabiliteScore = 45
  } else if (ratio >= 2.5) {
    solvabiliteScore = 30
    flags.push(`Revenus ${ratio.toFixed(1)}× loyer (marché : 3×)`)
  } else if (ratio >= 2) {
    solvabiliteScore = 15
    flags.push(`Revenus faibles : ${ratio.toFixed(1)}× loyer`)
  } else {
    solvabiliteScore = 5
    flags.push(`Revenus insuffisants : ${ratio.toFixed(1)}× loyer`)
  }

  // ─── Situation professionnelle (0-25) ───────────────────
  let situationScore = 0
  const sit = (profil.situation_pro || "").trim()
  if (!sit) {
    flags.push("Situation pro non renseignée")
  } else if (SITUATION_PRO_STABLE.has(sit)) {
    situationScore = 25
  } else if (SITUATION_PRO_MOYENNE.has(sit)) {
    situationScore = 15
  } else if (SITUATION_PRO_FAIBLE.has(sit)) {
    situationScore = 10
    flags.push(`Situation : ${sit}`)
  } else {
    situationScore = 12
  }

  // ─── Garant (0-20) ──────────────────────────────────────
  // Dérivé de type_garant (le formulaire /profil stocke un string comme
  // "Personne physique", "Organisme (Visale)…", "Aucun garant") OU du
  // flag explicite `garant` si présent.
  let garantScore = 0
  const typeGarant = (profil.type_garant || "").toLowerCase().trim()
  const aGarant = profil.garant === true || (
    typeGarant.length > 0 &&
    !typeGarant.includes("aucun") &&
    !typeGarant.includes("sans")
  )
  const sansGarant = profil.garant === false || typeGarant.includes("aucun") || typeGarant.includes("sans")
  if (aGarant) {
    garantScore = 20
  } else if (sansGarant) {
    flags.push("Pas de garant")
  } else {
    flags.push("Garant non renseigné")
  }

  // ─── Complétude du profil (0-10) ────────────────────────
  const champs = [
    profil.nom,
    profil.telephone,
    profil.ville_souhaitee,
    profil.budget_max,
    profil.profil_locataire,
  ]
  const remplis = champs.filter(v => v !== null && v !== undefined && v !== "").length
  const completudeScore = Math.round((remplis / champs.length) * 10)

  const score = Math.min(100, solvabiliteScore + situationScore + garantScore + completudeScore)

  let tier: ScreeningResult["tier"]
  let color: string
  let bg: string
  let border: string
  let label: string

  if (score >= 80) {
    tier = "excellent"; color = "#15803d"; bg = "#dcfce7"; border = "#86efac"; label = "Excellent"
  } else if (score >= 60) {
    tier = "bon"; color = "#166534"; bg = "#f0fdf4"; border = "#bbf7d0"; label = "Bon candidat"
  } else if (score >= 40) {
    tier = "moyen"; color = "#c2410c"; bg = "#fff7ed"; border = "#fed7aa"; label = "À examiner"
  } else if (score >= 20) {
    tier = "faible"; color = "#b91c1c"; bg = "#fee2e2"; border = "#fecaca"; label = "Risqué"
  } else {
    tier = "incomplet"; color = "#6b7280"; bg = "#f3f4f6"; border = "#e5e7eb"; label = "Incomplet"
  }

  return {
    score,
    tier,
    color,
    bg,
    border,
    label,
    summary: buildSummary(profil, ratio),
    flags,
    ratioSolvabilite: ratio,
  }
}
