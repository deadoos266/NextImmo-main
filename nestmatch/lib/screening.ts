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
  prenom?: string | null
  nom?: string | null
  telephone?: string | null
  ville_souhaitee?: string | null
  budget_max?: number | string | null
  profil_locataire?: string | null
  // Nouveaux champs (migration 007) utilisés pour bonus/malus
  date_embauche?: string | null
  logement_actuel_type?: string | null
  mobilite_pro?: boolean | null
  a_apl?: boolean | null
  presentation?: string | null
}

/**
 * Critères proprio cote annonce (Paul 2026-04-27 V1.5). Lus pour ajuster
 * dynamiquement le screening en fonction des exigences de chaque annonce.
 * Si non fournis, le screening utilise les seuils marche par defaut (3×).
 */
export interface ScreeningAnnonceCriteria {
  /** Multiplicateur revenus / loyer attendu. Default 3.0 (marche standard). */
  min_revenus_ratio?: number | string | null
  /** Liste de garants explicitement acceptes par le proprio. Si vide ou null,
   *  tous les garants sont acceptes. Match insensible a la casse + substring. */
  garants_acceptes?: string[] | null
  /** Liste de profils pro acceptes. Idem : si vide, tous acceptes. */
  profils_acceptes?: string[] | null
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
 * @param annonce Optionnel — critères proprio (min_revenus_ratio, garants
 *   acceptes, profils acceptes). Si fournis, le screening adapte ses
 *   seuils dynamiquement (Paul 2026-04-27 V1.5). Backward compat : si
 *   absent, comportement identique au screening v1 (seuils marche 3×).
 */
export function computeScreening(
  profil: ScreeningProfil | null | undefined,
  loyer: number | null | undefined,
  annonce?: ScreeningAnnonceCriteria | null,
): ScreeningResult {
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
  // Seuil dynamique : si l'annonce specifie min_revenus_ratio (Step 6 du
  // wizard), on l'utilise. Sinon fallback 3× marche standard. Paul 2026-04-27 V1.5.
  const seuilRatio = (() => {
    if (!annonce) return 3
    const v = parseNumber(annonce.min_revenus_ratio)
    return v !== null && v > 0 ? v : 3
  })()
  let solvabiliteScore = 0
  if (ratio === null) {
    flags.push(revenus === null ? "Revenus non renseignés" : "Loyer inconnu")
  } else if (ratio >= seuilRatio) {
    solvabiliteScore = 45
  } else if (ratio >= seuilRatio - 0.5) {
    solvabiliteScore = 30
    flags.push(`Revenus ${ratio.toFixed(1)}× loyer (proprio attend ${seuilRatio.toFixed(1)}×)`)
  } else if (ratio >= seuilRatio - 1) {
    solvabiliteScore = 15
    flags.push(`Revenus faibles : ${ratio.toFixed(1)}× loyer (attendu ${seuilRatio.toFixed(1)}×)`)
  } else {
    solvabiliteScore = 5
    flags.push(`Revenus insuffisants : ${ratio.toFixed(1)}× loyer (attendu ${seuilRatio.toFixed(1)}×)`)
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

  // Filtre profils acceptes par le proprio (Paul 2026-04-27 V1.5).
  // Si l'annonce specifie une whitelist (`profils_acceptes`) et que la
  // situation_pro candidat n'y figure pas, on flag explicitement et on
  // pénalise -10 (score brut, pas exclusion). Si la liste contient
  // "Indifférent" ou est vide, pas de filtre.
  const profilsAcceptesArr = Array.isArray(annonce?.profils_acceptes) ? annonce!.profils_acceptes! : []
  const profilsIndifferent = profilsAcceptesArr.some(p => p && (p.toLowerCase().includes("indifférent") || p.toLowerCase().includes("indifferent")))
  const profilsListe = profilsAcceptesArr.filter(p => p && !p.toLowerCase().includes("indifférent") && !p.toLowerCase().includes("indifferent"))
  if (!profilsIndifferent && profilsListe.length > 0 && sit) {
    const matchProfil = profilsListe.some(p =>
      p.toLowerCase().trim() === sit.toLowerCase().trim() ||
      sit.toLowerCase().includes(p.toLowerCase()) ||
      p.toLowerCase().includes(sit.toLowerCase())
    )
    if (!matchProfil) {
      situationScore = Math.max(0, situationScore - 10)
      flags.push(`Profil "${sit}" non listé dans les acceptés (${profilsListe.join(", ")})`)
    }
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

  // Filtre garants acceptes par le proprio (Paul 2026-04-27 V1.5).
  // Si l'annonce specifie une whitelist (`garants_acceptes`) et que le
  // type_garant candidat n'y figure pas, on flag + penalise -10. Liste
  // vide ou "Indifférent" → pas de filtre.
  const garantsAcceptesArr = Array.isArray(annonce?.garants_acceptes) ? annonce!.garants_acceptes! : []
  const garantsIndifferent = garantsAcceptesArr.some(g => g && (g.toLowerCase().includes("indifférent") || g.toLowerCase().includes("indifferent")))
  const garantsListe = garantsAcceptesArr.filter(g => g && !g.toLowerCase().includes("indifférent") && !g.toLowerCase().includes("indifferent"))
  if (!garantsIndifferent && garantsListe.length > 0 && aGarant && typeGarant) {
    const matchGarant = garantsListe.some(g => {
      const gn = g.toLowerCase().trim()
      return gn === typeGarant ||
        typeGarant.includes(gn) ||
        gn.includes(typeGarant) ||
        // Cas particuliers connus
        (gn.includes("visale") && typeGarant.includes("visale")) ||
        (gn.includes("garantme") && typeGarant.includes("garantme")) ||
        (gn.includes("parents") && typeGarant.includes("parent")) ||
        (gn.includes("caution") && typeGarant.includes("caution"))
    })
    if (!matchGarant) {
      garantScore = Math.max(0, garantScore - 10)
      flags.push(`Garant "${profil.type_garant}" non listé dans les acceptés (${garantsListe.join(", ")})`)
    }
  }

  // ─── Complétude du profil (0-10) ────────────────────────
  const champs = [
    profil.prenom || profil.nom,
    profil.telephone,
    profil.ville_souhaitee,
    profil.budget_max,
    profil.profil_locataire,
  ]
  const remplis = champs.filter(v => v !== null && v !== undefined && v !== "").length
  const completudeScore = Math.round((remplis / champs.length) * 10)

  // ─── Bonus/malus contextuels (−10 à +15) ────────────────
  // Ancienneté emploi : un CDI stable depuis +12 mois vaut mieux qu'un CDI
  // signé la semaine dernière. Source : date_embauche (migration 007).
  let bonusContexte = 0
  if (profil.date_embauche) {
    const t = new Date(profil.date_embauche).getTime()
    if (Number.isFinite(t)) {
      const mois = (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44)
      if (mois >= 24) bonusContexte += 8
      else if (mois >= 12) bonusContexte += 5
      else if (mois >= 6) bonusContexte += 2
      else if (mois >= 0 && mois < 3) flags.push("Emploi récent (< 3 mois)")
    }
  }

  // Visale — garantie Action Logement — très apprécié des proprios
  if (typeGarant.includes("visale")) bonusContexte += 3

  // Mobilité pro : éligible Visale même sans garant, signal positif
  if (profil.mobilite_pro === true && !aGarant) bonusContexte += 2

  // APL : sécurise une partie du loyer
  if (profil.a_apl === true) bonusContexte += 2

  // Présentation écrite : engagement dans la candidature
  if (profil.presentation && profil.presentation.trim().length >= 50) bonusContexte += 2

  // Logement actuel "Hébergé" + pas de garant + revenus faibles = risque
  if (profil.logement_actuel_type === "Hébergé" && !aGarant && ratio !== null && ratio < 2.5) {
    bonusContexte -= 5
    flags.push("Hébergé sans garant")
  }

  // Flag "Étudiant sans garant" — signal fort pour le proprio
  if (SITUATION_PRO_FAIBLE.has(sit) && !aGarant) {
    flags.push(`${sit} sans garant`)
  }

  const score = Math.max(0, Math.min(100, solvabiliteScore + situationScore + garantScore + completudeScore + bonusContexte))

  // V11.6 (Paul 2026-04-28) — distinguer "Risqué" (jugement sur donnees
  // PRESENTES) de "Dossier incomplet" (absence de donnees). Avant, un
  // candidat qui n'a juste pas rempli ses revenus + son garant tombait en
  // "Risqué" (rouge) alors que c'est juste un manque d'info, pas un risque
  // metier reel.
  // Spec : revenus manquants ET (garant=false OU non renseigne) →
  // "Dossier incomplet" (gris). Sinon score bas avec donnees presentes →
  // "Risqué" (rouge).
  const revenusManquant = revenus === null
  const garantManquant = !aGarant && !sansGarant  // Ni "oui" ni "non explicite"
  const dossierIncomplet = revenusManquant && (garantManquant || sansGarant)

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
  } else if (dossierIncomplet) {
    // V11.6 — score bas MAIS revenus + garant non renseignes : ce n'est pas
    // un risque, c'est un dossier a completer. Couleur gris neutre, pas rouge.
    tier = "incomplet"; color = "#6b7280"; bg = "#f3f4f6"; border = "#e5e7eb"; label = "Dossier incomplet"
  } else if (score >= 20) {
    // Score bas avec donnees presentes → vrai jugement "Risqué".
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
