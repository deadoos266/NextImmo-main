/**
 * Validation côté client des fichiers uploadés.
 *
 * ATTENTION : la validation client est bypassable (DevTools, appel direct
 * Supabase). Elle sert à :
 *   1. Feedback UX immédiat (rejet rapide d'un SVG ou d'un fichier énorme)
 *   2. Réduire les uploads parasites (économie bande passante + storage)
 *
 * La DÉFENSE SERVEUR repose sur les Storage Bucket Policies Supabase
 * (allowed_mime_types + file_size_limit) — voir MEMORY.md.
 *
 * Magic bytes checkés en plus du MIME pour attraper les renaming naïfs
 * (.svg renommé en .jpg).
 */

export type ValidationResult = { ok: true; error?: undefined } | { ok: false; error: string }

const MB = 1024 * 1024

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
const DOC_MIME = [...IMAGE_MIME, "application/pdf"]

const IMAGE_MAX_SIZE = 10 * MB
const DOC_MAX_SIZE = 15 * MB

// Magic bytes (premiers octets du fichier binaire)
const MAGIC = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: [0x52, 0x49, 0x46, 0x46], // "RIFF" — complété par "WEBP" à offset 8
  pdf: [0x25, 0x50, 0x44, 0x46], // "%PDF"
  heic: [0x66, 0x74, 0x79, 0x70], // "ftyp" — à offset 4, pas 0
}

function startsWith(bytes: Uint8Array, pattern: number[], offset = 0): boolean {
  if (bytes.length < offset + pattern.length) return false
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) return false
  }
  return true
}

async function readFirstBytes(file: File, n = 16): Promise<Uint8Array> {
  const slice = file.slice(0, n)
  const buf = await slice.arrayBuffer()
  return new Uint8Array(buf)
}

function detectMagic(bytes: Uint8Array): string | null {
  if (startsWith(bytes, MAGIC.jpeg)) return "image/jpeg"
  if (startsWith(bytes, MAGIC.png)) return "image/png"
  if (startsWith(bytes, MAGIC.gif)) return "image/gif"
  if (startsWith(bytes, MAGIC.webp)) {
    // bytes 8-11 doivent être "WEBP"
    const webpMarker = [0x57, 0x45, 0x42, 0x50]
    if (startsWith(bytes, webpMarker, 8)) return "image/webp"
  }
  if (startsWith(bytes, MAGIC.pdf)) return "application/pdf"
  if (startsWith(bytes, MAGIC.heic, 4)) return "image/heic"
  return null
}

async function validate(
  file: File,
  opts: { allowedMime: string[]; maxSize: number; label: string }
): Promise<ValidationResult> {
  if (file.size === 0) {
    return { ok: false, error: `${opts.label} vide.` }
  }
  if (file.size > opts.maxSize) {
    const mb = (opts.maxSize / MB).toFixed(0)
    return { ok: false, error: `${opts.label} trop volumineux (max ${mb} Mo).` }
  }
  if (!opts.allowedMime.includes(file.type)) {
    return {
      ok: false,
      error: `Format non autorisé (${file.type || "inconnu"}). Formats acceptés : JPEG, PNG, WebP${opts.allowedMime.includes("application/pdf") ? ", PDF" : ""}.`,
    }
  }

  // Magic bytes check — attrape les fichiers renommés
  const bytes = await readFirstBytes(file)
  const detected = detectMagic(bytes)
  if (!detected) {
    return { ok: false, error: `Contenu du fichier non reconnu comme image valide.` }
  }
  if (!opts.allowedMime.includes(detected)) {
    return { ok: false, error: `Contenu du fichier (${detected}) ne correspond pas au format déclaré.` }
  }

  return { ok: true }
}

export function validateImage(file: File): Promise<ValidationResult> {
  return validate(file, {
    allowedMime: IMAGE_MIME,
    maxSize: IMAGE_MAX_SIZE,
    label: "Fichier image",
  })
}

export function validateDocument(file: File): Promise<ValidationResult> {
  return validate(file, {
    allowedMime: DOC_MIME,
    maxSize: DOC_MAX_SIZE,
    label: "Document",
  })
}
