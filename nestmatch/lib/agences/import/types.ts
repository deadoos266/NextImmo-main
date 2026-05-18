/**
 * V97.39.34 — Phase B import bulk — Types communs.
 *
 * Tous les parsers (Apimo XML, Hektor XML, CSV générique) produisent des
 * `ParsedAnnonce` qui sont ensuite normalisés et insérés en DB.
 */

export interface ParsedAnnonce {
  /** Identifiant externe (référence dans le logiciel agence). Permet UPSERT. */
  external_ref?: string | null
  titre: string
  description?: string | null
  ville?: string | null
  code_postal?: string | null
  adresse?: string | null
  prix?: number | null
  charges?: number | null
  caution?: number | null
  surface?: number | null
  pieces?: number | null
  chambres?: number | null
  etage?: number | null
  dpe?: string | null
  type_bien?: string | null
  dispo?: string | null
  photos?: string[] | null

  // Équipements (mappés vers les boolean KeyMatch existants)
  meuble?: boolean | null
  fibre?: boolean | null
  parking?: boolean | null
  cave?: boolean | null
  balcon?: boolean | null
  terrasse?: boolean | null
  jardin?: boolean | null
  ascenseur?: boolean | null
}

export interface ImportPreview {
  format: ImportFormat
  total: number
  preview: ParsedAnnonce[]    // les 5 premiers pour validation UI
  warnings: string[]           // ex: "3 annonces sans prix, ignorées"
  errors: string[]             // ex: "Fichier XML invalide ligne 42"
}

export interface ImportResult {
  imported: number
  updated: number
  skipped: number
  failed: number
  details: Array<{
    external_ref?: string | null
    titre: string
    action: "imported" | "updated" | "skipped" | "failed"
    annonce_id?: number
    reason?: string
  }>
}

export type ImportFormat = "apimo" | "hektor" | "csv" | "unknown"

export const SUPPORTED_FORMATS: ImportFormat[] = ["apimo", "hektor", "csv"]

/** Mime types acceptés sur l'endpoint upload. */
export const ACCEPTED_MIME = [
  "application/xml",
  "text/xml",
  "text/csv",
  "application/csv",
  "text/plain",  // certains exports CSV envoient ce mime
] as const

export const MAX_FILE_SIZE = 20 * 1024 * 1024  // 20 MB (assez pour 500 biens)
