// V9.3 (Paul 2026-04-28) — Score qualité d'une annonce sur 100. Mesure
// objective de la "completude editoriale" : photos, description, mot
// proprio, DPE renseigne, localisation exacte, caracteristiques.
//
// Usage 1 — multiplicateur sur le score matching : facteur 0.7..1.0
// (max boost 0%, max malus -30%). Une annonce premium remonte naturellement
// dans le tri.
//
// Usage 2 — UI fiche annonce et wizard : feedback live au proprio "score
// X/100, +Y pts si vous ajoutez Z".

export interface QualiteInput {
  photos?: ReadonlyArray<unknown> | null
  description?: string | null
  message_proprietaire?: string | null
  dpe?: string | null
  localisation_exacte?: boolean | null
  chambres?: number | string | null
  pieces?: number | string | null
  surface?: number | string | null
}

export interface QualiteBreakdown {
  /** Score global 0..100. */
  score: number
  /** Tier label deduit du score. */
  tier: "premium" | "detaillee" | "minimaliste" | "incomplete"
  /** Couleur d'accent associee au tier (cohérente palette T dossier). */
  color: string
  /** Background color tier. */
  bg: string
  /** Border color tier. */
  border: string
  /** Label francais affichage UI. */
  label: string
  /** Detail des points par critere (positifs uniquement). */
  parts: Array<{ key: string; pts: number; max: number; label: string; ok: boolean }>
  /** Suggestions ordonnees par impact decroissant pour ameliorer le score. */
  suggestions: Array<{ key: string; deltaPts: number; hint: string }>
}

const PHOTOS_MAX = 30
const DESC_MAX = 20
const MSG_MAX = 15
const DPE_MAX = 15
const EXACT_MAX = 10
const CARAC_MAX = 10
export const QUALITE_TOTAL = PHOTOS_MAX + DESC_MAX + MSG_MAX + DPE_MAX + EXACT_MAX + CARAC_MAX  // 100

function nbPhotos(photos: unknown): number {
  if (!Array.isArray(photos)) return 0
  return photos.filter(p => typeof p === "string" && p.trim().length > 0).length
}

function descLen(desc: unknown): number {
  if (typeof desc !== "string") return 0
  return desc.trim().length
}

function dpePoints(dpe: unknown): number {
  if (typeof dpe !== "string") return 0
  const upper = dpe.trim().toUpperCase()
  if (["A", "B", "C", "D"].includes(upper)) return DPE_MAX
  if (upper === "E") return 5
  return 0  // F, G, vide, "Non renseigné" → 0
}

function caracPoints(input: QualiteInput): number {
  const has = (v: unknown) => v !== null && v !== undefined && v !== ""
  return (has(input.chambres) && has(input.pieces) && has(input.surface)) ? CARAC_MAX : 0
}

export function computeQualiteAnnonce(input: QualiteInput): QualiteBreakdown {
  const np = nbPhotos(input.photos)
  const photosPts = np >= 6 ? PHOTOS_MAX : np >= 3 ? 15 : np >= 1 ? 5 : 0
  const dl = descLen(input.description)
  const descPts = dl > 300 ? DESC_MAX : dl >= 80 ? 10 : 0
  const msgPts = (typeof input.message_proprietaire === "string" && input.message_proprietaire.trim().length > 0) ? MSG_MAX : 0
  const dpePts = dpePoints(input.dpe)
  const exactPts = input.localisation_exacte === true ? EXACT_MAX : 0
  const caracPts = caracPoints(input)

  const score = photosPts + descPts + msgPts + dpePts + exactPts + caracPts

  const parts: QualiteBreakdown["parts"] = [
    { key: "photos", pts: photosPts, max: PHOTOS_MAX, label: `Photos (${np})`, ok: photosPts >= 15 },
    { key: "description", pts: descPts, max: DESC_MAX, label: "Description", ok: descPts === DESC_MAX },
    { key: "message", pts: msgPts, max: MSG_MAX, label: "Mot du propriétaire", ok: msgPts > 0 },
    { key: "dpe", pts: dpePts, max: DPE_MAX, label: "DPE renseigné", ok: dpePts === DPE_MAX },
    { key: "exacte", pts: exactPts, max: EXACT_MAX, label: "Localisation exacte", ok: exactPts > 0 },
    { key: "caracteristiques", pts: caracPts, max: CARAC_MAX, label: "Caractéristiques complètes", ok: caracPts > 0 },
  ]

  // V11.5 — wording revu : badge deltaPts = gain immediat (pas max
  // theorique). Texte plus concis et naturel.
  const suggestions: QualiteBreakdown["suggestions"] = []
  if (photosPts < PHOTOS_MAX) {
    if (np < 3) {
      const need = 3 - np
      suggestions.push({
        key: "photos",
        deltaPts: 15 - photosPts,
        hint: `Ajoutez ${need} photo${need > 1 ? "s" : ""} (+${15 - photosPts} pts).`,
      })
    } else if (np < 6) {
      const need = 6 - np
      suggestions.push({
        key: "photos",
        deltaPts: PHOTOS_MAX - photosPts,
        hint: `Ajoutez ${need} photo${need > 1 ? "s" : ""} pour passer en mode premium (+${PHOTOS_MAX - photosPts} pts).`,
      })
    }
  }
  if (descPts < DESC_MAX) {
    if (dl < 80) {
      // Gain immediat = +10 (passage 80 chars). Boost a +20 mentionne en
      // suffixe.
      const immediate = 10 - descPts
      suggestions.push({
        key: "description",
        deltaPts: immediate,
        hint: `Ajoutez ${80 - dl} caractères à la description (boost à +${DESC_MAX - descPts} si vous dépassez 300 caractères).`,
      })
    } else {
      // Deja >= 80 chars, suggestion = passer le cap 300.
      suggestions.push({
        key: "description",
        deltaPts: DESC_MAX - descPts,
        hint: `Détaillez davantage la description (>300 caractères, +${DESC_MAX - descPts} pts).`,
      })
    }
  }
  if (msgPts === 0) suggestions.push({ key: "message", deltaPts: MSG_MAX, hint: `Ajoutez un mot du propriétaire (+${MSG_MAX} pts).` })
  if (dpePts < DPE_MAX) suggestions.push({ key: "dpe", deltaPts: DPE_MAX - dpePts, hint: dpePts === 0
    ? `Renseignez le DPE (A-D : +${DPE_MAX} pts).`
    : `DPE E donne ${dpePts} pts. Pour le max, classes A-D (+${DPE_MAX - dpePts} pts si rénovation).` })
  if (exactPts === 0) suggestions.push({ key: "exacte", deltaPts: EXACT_MAX, hint: `Activez la localisation exacte sur la carte (+${EXACT_MAX} pts).` })
  if (caracPts === 0) suggestions.push({ key: "caracteristiques", deltaPts: CARAC_MAX, hint: `Renseignez chambres, pièces et surface (+${CARAC_MAX} pts).` })
  suggestions.sort((a, b) => b.deltaPts - a.deltaPts)

  let tier: QualiteBreakdown["tier"]
  let color: string
  let bg: string
  let border: string
  let label: string

  if (score >= 80) {
    tier = "premium"; color = "#15803d"; bg = "#F0FAEE"; border = "#C6E9C0"; label = "Annonce premium"
  } else if (score >= 60) {
    tier = "detaillee"; color = "#0ea5e9"; bg = "#EFF8FE"; border = "#BFE2F4"; label = "Annonce détaillée"
  } else if (score >= 40) {
    tier = "minimaliste"; color = "#a16207"; bg = "#FBF6EA"; border = "#EADFC6"; label = "Annonce minimaliste"
  } else {
    tier = "incomplete"; color = "#b91c1c"; bg = "#FEECEC"; border = "#F4C9C9"; label = "Annonce incomplète"
  }

  return { score, tier, color, bg, border, label, parts, suggestions }
}

/**
 * V9.3 — facteur multiplicateur applique au score matching.
 * Bareme : score 0 → 0.7 ; score 50 → 0.85 ; score 100 → 1.0.
 * Lineaire entre 0.7 (-30%) et 1.0 (0%, pas de boost positif).
 *
 * Note : pas de boost > 1.0 : on respecte le bareme matching existant et
 * on n'inflate pas artificiellement les scores. Une annonce parfaite garde
 * son score natif. Une annonce incomplete est juste retrogradee.
 */
export function qualiteFacteur(score: number): number {
  const clamped = Math.max(0, Math.min(100, score))
  return 0.7 + (clamped / 100) * 0.3
}
