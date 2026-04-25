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
