/**
 * Palette de gradients utilisés comme placeholder d'image sur les cartes
 * d'annonces (list /annonces, /favoris, /mes-candidatures) quand aucune
 * photo n'est disponible.
 *
 * Usage : `GRADIENTS[annonce.id % GRADIENTS.length]`
 */
export const CARD_GRADIENTS = [
  "linear-gradient(135deg, #e8e0f0, #d4c5e8)",
  "linear-gradient(135deg, #d4e8e0, #b8d4c8)",
  "linear-gradient(135deg, #e8d4c5, #d4b89a)",
  "linear-gradient(135deg, #c5d4e8, #a0b8d4)",
  "linear-gradient(135deg, #e8e8c5, #d4d4a0)",
  "linear-gradient(135deg, #e8c5d4, #d4a0b8)",
]

export function gradientForId(id: number | string): string {
  const n = typeof id === "string" ? id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) : id
  return CARD_GRADIENTS[Math.abs(n) % CARD_GRADIENTS.length]
}
