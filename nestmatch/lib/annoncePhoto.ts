// V72.3f — helper pour résoudre la photo principale d'une annonce avec
// fallback systématique sur le placeholder.
//
// Avant V72 : les composants utilisaient soit /hero/1.jpg (photo signature
// de la marque, peu pertinent pour une annonce), soit une image Unsplash
// random (peu pro, pas reproductible). Le user demande UNE photo neutre
// commune dès qu'une annonce n'a pas de photos uploadées.
//
// Le placeholder est généré par scripts/generate-annonce-placeholder.mjs
// et committé dans /public/annonce-placeholder.jpg (~11KB).

export const ANNONCE_PLACEHOLDER = "/annonce-placeholder.jpg"

/**
 * Retourne la 1ère photo si présente, sinon le placeholder neutre.
 * Tolère null/undefined, array vide, et entrées non-string.
 */
export function annonceCoverPhoto(photos: unknown): string {
  if (!Array.isArray(photos) || photos.length === 0) return ANNONCE_PLACEHOLDER
  const first = photos[0]
  if (typeof first !== "string" || first.trim() === "") return ANNONCE_PLACEHOLDER
  return first
}
