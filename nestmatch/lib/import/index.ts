/**
 * V97.36 P3-7 — Entry point de l'import multi-source.
 *
 * Usage côté route API :
 *   import { importFromUrl } from "@/lib/import"
 *   const result = await importFromUrl(url)
 */

import type { ImportedAnnonce } from "./types"
import { findParser } from "./parsers"
import { fetchUrl, ImportFetchError } from "./fetcher"
import { countFields, FIELDS_TOTAL } from "./helpers"

export class ImportError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = "ImportError"
  }
}

export interface ImportResult {
  data: ImportedAnnonce
  fields_extracted: number
  fields_total: number
  duration_ms: number
}

/**
 * Importe une annonce à partir d'une URL :
 *  1. Trouve le parser qui matche
 *  2. Fetch le HTML
 *  3. Parse → ImportedAnnonce
 *  4. Retourne le résultat avec stats (pour logging)
 *
 * Throws ImportError avec code identifiable :
 *  - NO_PARSER : aucun parser matche (jamais en pratique, generic-og catch-all)
 *  - FETCH_* : erreurs réseau (relayées depuis fetcher.ts)
 *  - PARSE_ERROR : parser a planté
 */
export async function importFromUrl(url: string): Promise<ImportResult> {
  const t0 = Date.now()

  const parser = findParser(url)
  if (!parser) {
    throw new ImportError("NO_PARSER", "Aucun parser ne peut traiter cette URL")
  }

  let html: string
  let finalUrl: string
  try {
    const fetched = await fetchUrl(url)
    html = fetched.html
    finalUrl = fetched.final_url
  } catch (e) {
    if (e instanceof ImportFetchError) {
      throw new ImportError(e.code, e.message)
    }
    throw new ImportError("FETCH_ERROR", e instanceof Error ? e.message : "Erreur réseau")
  }

  let parsed: Partial<ImportedAnnonce>
  try {
    parsed = await parser.parse(html, finalUrl)
  } catch (e) {
    throw new ImportError("PARSE_ERROR", e instanceof Error ? e.message : "Erreur de parsing")
  }

  const data: ImportedAnnonce = {
    source: parser.name,
    source_url: finalUrl,
    ...parsed,
  }

  return {
    data,
    fields_extracted: countFields(data),
    fields_total: FIELDS_TOTAL,
    duration_ms: Date.now() - t0,
  }
}

export { SUPPORTED_SITES } from "./parsers"
export type { ImportedAnnonce, ImportSource } from "./types"
