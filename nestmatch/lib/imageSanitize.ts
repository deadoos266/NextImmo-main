/**
 * Strip EXIF + re-encode d'une image avant stockage.
 *
 * Pourquoi :
 *   Les photos smartphone contiennent souvent la géolocalisation GPS dans
 *   leurs métadonnées EXIF. Uploader ces photos telles quelles fuiterait
 *   l'adresse du locataire (avatar pris chez soi) ou du proprio (photo
 *   d'annonce prise sur place, même si l'adresse exacte est cachée).
 *
 * Comment :
 *   sharp ne conserve AUCUNE métadonnée par défaut (hors orientation appliquée
 *   via .rotate()). Le re-encode jpeg/webp produit donc un fichier sans EXIF,
 *   sans IPTC, sans XMP.
 *
 * Bonus : resize max + recompression — économie de stockage et bande passante.
 */

import sharp from "sharp"

export type SanitizeFormat = "jpeg" | "webp"

export type SanitizeOpts = {
  maxWidth?: number
  maxHeight?: number
  format?: SanitizeFormat
  quality?: number
}

export type SanitizeResult = {
  bytes: Buffer
  mime: string
  ext: string
  width: number
  height: number
  size: number
}

export async function sanitizeImage(
  input: Buffer,
  opts: SanitizeOpts = {},
): Promise<SanitizeResult> {
  const maxWidth = opts.maxWidth ?? 2000
  const maxHeight = opts.maxHeight ?? 2000
  const format = opts.format ?? "jpeg"
  const quality = opts.quality ?? 85

  // .rotate() lit l'EXIF orientation et applique la rotation AVANT strip,
  // sinon une photo portrait iPhone s'afficherait couchée.
  let pipeline = sharp(input, { failOn: "truncated" })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })

  if (format === "jpeg") {
    pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true })
  } else {
    pipeline = pipeline.webp({ quality })
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

  return {
    bytes: data,
    mime: format === "jpeg" ? "image/jpeg" : "image/webp",
    ext: format === "jpeg" ? "jpg" : "webp",
    width: info.width,
    height: info.height,
    size: data.length,
  }
}
