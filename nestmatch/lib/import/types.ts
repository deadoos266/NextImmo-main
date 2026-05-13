/**
 * V97.36 P3-7 — Types de l'import multi-source d'annonce.
 *
 * `ImportedAnnonce` = données extraites par un parser, prêtes à être
 * injectées dans le wizard /proprietaire/ajouter.
 *
 * Tous les champs sont optionnels : un parser remplit ce qu'il peut, le
 * reste reste vide pour saisie manuelle. Les champs `warnings` permettent
 * d'alerter l'user sur des limitations (ex: photos non importées).
 */

export type ImportSource =
  | "leboncoin"
  | "seloger"
  | "pap"
  | "bienici"
  | "logic-immo"
  | "generic"

export interface ImportedAnnonce {
  source: ImportSource
  source_url: string
  source_id?: string
  /** Titre de l'annonce (≤ 120 chars conseillé pour KeyMatch). */
  title?: string
  /** Description longue. */
  description?: string
  /** Loyer mensuel HC (en €). */
  price?: number
  /** Charges mensuelles (en €). */
  charges?: number
  /** Dépôt de garantie (en €). */
  deposit?: number
  /** Surface en m². */
  surface?: number
  /** Nombre de pièces. */
  rooms?: number
  /** Nombre de chambres. */
  bedrooms?: number
  /** Étage (string libre type "RDC", "3", "5+"). */
  floor?: string
  /** Meublé. */
  furnished?: boolean
  /** Classe DPE A-G. */
  dpe?: "A" | "B" | "C" | "D" | "E" | "F" | "G"
  /** Type de bien (Appartement, Maison, Studio, etc.). */
  property_type?: string
  /** Ville. */
  city?: string
  /** Code postal. */
  postal_code?: string
  /** Adresse complète si dispo. */
  address?: string
  /** URLs photos (max 12). */
  photos?: string[]
  /** Tags équipements ('parking', 'balcon', 'cave', 'fibre', etc.). */
  equipments?: string[]
  /** Date dispo ISO YYYY-MM-DD. */
  available_from?: string
  /** Latitude. */
  lat?: number
  /** Longitude. */
  lng?: number
  /** Warnings pour l'user (photos manquantes, source partielle, etc.). */
  warnings?: string[]
}

export interface ParseStats {
  /** Nombre de fields renseignés par le parser. */
  fields_extracted: number
  /** Nombre de fields total qu'on essaie d'extraire (référence). */
  fields_total: number
}

export interface Parser {
  /** Identifiant unique (= valeur ImportSource). */
  name: ImportSource
  /** Label user-facing (ex: "Leboncoin", "SeLoger"). */
  label: string
  /** Domaines hosts matchés (sans https://). */
  hosts: string[]
  /** Décide si ce parser peut traiter l'URL donnée. */
  matches: (url: string) => boolean
  /** Parse le HTML et retourne les données extraites partielles. */
  parse: (html: string, url: string) => Promise<Partial<ImportedAnnonce>>
}
