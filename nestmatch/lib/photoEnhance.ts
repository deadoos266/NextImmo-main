/**
 * Pipeline d'amelioration auto des photos d'annonces (Paul 2026-04-27).
 *
 * Pourquoi :
 *   Les photos uploadees par les proprios sont souvent prises en interieur,
 *   en lumiere mediocre, sans retouche. Une etape automatique d'enhance
 *   subtile (auto-contrast + leger boost saturation/exposition + sharpening
 *   doux) aligne le rendu sans denaturer l'image. C'est ce que font Airbnb,
 *   SeLoger et la plupart des plateformes : aucun proprio n'a Photoshop.
 *
 * Comment :
 *   - .normalize() : auto-contrast intelligent (etirement de l'histogramme).
 *     Ne touche pas les images deja contrastees, "boost" celles qui sont
 *     plates. C'est l'effet le plus visible et le plus "premium".
 *   - .modulate({ brightness: 1.05, saturation: 1.05 }) : +5% de chacun.
 *     Limite stricte pour eviter le sur-saturage typique des filtres Insta.
 *   - .sharpen({ sigma: 0.8 }) : sharpening doux. Compense le flou de
 *     resize sans creer de halos visibles.
 *
 * Idempotence : appliquer 2x produit un resultat tres proche de 1x (les
 * operations sont des fonctions monotones contractees), pas dangereux mais
 * inutile. Le caller (route API) decide de l'appliquer ou pas via un toggle.
 */

import type { Sharp } from "sharp"

/**
 * Applique le pipeline enhance sur une instance Sharp en cours de
 * construction. Retourne la meme instance (chainable). Doit etre invoque
 * AVANT le toFormat() final dans le pipeline appelant.
 */
export function applyPhotoEnhance(pipeline: Sharp): Sharp {
  return pipeline
    .normalize()
    .modulate({ brightness: 1.05, saturation: 1.05 })
    .sharpen({ sigma: 0.8 })
}

/**
 * Heuristique : decide si l'enhance est pertinent pour cette image.
 * Pour l'instant on retourne toujours true (l'utilisateur a deja choisi via
 * le toggle UI). Reserve pour pouvoir skipper enhance sur des images
 * detectees deja "premium" plus tard (ex: images publiees par des photos
 * pros, deja retouchees) sans casser l'API.
 */
export function shouldEnhance(_metadata: { width?: number; height?: number; format?: string } | null = null): boolean {
  void _metadata
  return true
}
