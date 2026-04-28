// V7 chantier 3 (Paul 2026-04-28) — calcul du rang relatif d'une annonce
// dans la liste filtree actuelle. Complement au % match qui est ambigu
// pour l'user ("87% c'est bon ou mauvais ?"). Le rang #N sur Total est
// un signal beaucoup plus fort.

export interface RankInput {
  id: number
  scoreMatching: number | null
}

/**
 * Calcule le rang de chaque annonce a partir de leur score, par ordre
 * decroissant. Retourne une Map<id, rank> ou rank commence a 1.
 *
 * Annonces avec score null ou exclues : pas dans la map (pas de rang).
 * Tie-break : ordre stable (premier en input gagne).
 */
export function calcRangs(annonces: ReadonlyArray<RankInput>): Map<number, number> {
  const ranked = annonces
    .filter(a => typeof a.scoreMatching === "number" && a.scoreMatching > 0)
    .map((a, idx) => ({ id: a.id, score: a.scoreMatching as number, idx }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.idx - b.idx // stable
    })
  const map = new Map<number, number>()
  ranked.forEach((entry, i) => map.set(entry.id, i + 1))
  return map
}

/**
 * Seuil minimum de la liste pour afficher un rang. Sous ce seuil, "#1 sur 5"
 * sonne creux → on retombe sur le pourcentage seul.
 */
export const RANK_DISPLAY_MIN_TOTAL = 10

/**
 * Helper UI : doit-on afficher le rang pour cette liste ?
 */
export function shouldShowRank(total: number): boolean {
  return total >= RANK_DISPLAY_MIN_TOTAL
}
