/**
 * Palette officielle DPE (Diagnostic de Performance Énergétique) pour
 * KeyMatch — alignée sur la convention ADEME (vert→rouge progressif).
 *
 * Auparavant deux palettes vivaient en parallèle :
 *  - app/annonces/[id]/page.tsx (saturée : #22c55e / #f97316 / #dc2626)
 *  - app/components/annonces/ListingCardSearch.tsx (#16A34A / #EA580C…)
 * Résultat : la même lettre E s'affichait en rouge sur la liste mais en
 * orange foncé sur la fiche détail. Cette source unique remplace les deux.
 *
 * On garde la palette ListingCardSearch comme canonique : transition plus
 * lisible, F clairement distinct de E, fallback gris cohérent avec le reste
 * de l'UI (#8a8477).
 */

export const DPE_COLORS: Record<string, string> = {
  A: "#16A34A",
  B: "#65A30D",
  C: "#EAB308",
  D: "#F59E0B",
  E: "#EA580C",
  F: "#DC2626",
  G: "#7F1D1D",
}

/** Couleur DPE pour une lettre (case-insensitive). Fallback gris si inconnue. */
export function dpeColorFor(letter: string | null | undefined): string {
  if (!letter) return "#8a8477"
  const L = letter.toUpperCase()
  return DPE_COLORS[L] || "#8a8477"
}

// Bornes officielles ADEME (kWh énergie primaire/m²/an), arrondies pour
// la pédagogie. Source : décret 2021-19 + grille DPE 2021. Utilisé pour
// le tooltip pédagogique des chips DPE.
const DPE_RANGES: Record<string, { min: number; max: number; label: string }> = {
  A: { min: 0,   max: 50,   label: "Excellent · logement très peu énergivore" },
  B: { min: 51,  max: 90,   label: "Très bon · faibles dépenses énergétiques" },
  C: { min: 91,  max: 150,  label: "Bon · consommation modérée" },
  D: { min: 151, max: 230,  label: "Moyen · consommation correcte mais améliorable" },
  E: { min: 231, max: 330,  label: "Médiocre · logement assez énergivore" },
  F: { min: 331, max: 450,  label: "Mauvais · passoire thermique en limite" },
  G: { min: 451, max: 999,  label: "Très mauvais · passoire thermique (location interdite à terme)" },
}

/** Texte pédagogique d'une lettre DPE — bornes kWh + qualificatif. */
export function dpeDescription(letter: string | null | undefined): string | null {
  if (!letter) return null
  const L = letter.toUpperCase()
  const r = DPE_RANGES[L]
  if (!r) return null
  const range = L === "G" ? `> ${DPE_RANGES.F.max} kWh/m²/an` : `${r.min}–${r.max} kWh/m²/an`
  return `${range} · ${r.label}`
}

/** Estimation très grossière du coût annuel chauffage pour une surface donnée
 *  (médiane de la fourchette × surface × tarif moyen ~0.20 €/kWh).
 *  Volontairement imprécis : usage pédagogique pour donner un ordre d'idée,
 *  pas une simulation comptable. Renvoie null si pas de surface ou DPE inconnu. */
export function dpeEnergyCost(letter: string | null | undefined, surfaceM2: number | null | undefined): number | null {
  if (!letter || !surfaceM2 || surfaceM2 <= 0) return null
  const L = letter.toUpperCase()
  const r = DPE_RANGES[L]
  if (!r) return null
  const kwhMid = (r.min + (r.max === 999 ? 600 : r.max)) / 2
  const cost = kwhMid * surfaceM2 * 0.20
  return Math.round(cost / 50) * 50 // arrondi 50€
}
