/**
 * V97.36 P3-7 — Entry point de l'import multi-source.
 *
 * V97.39 (Phase 1) — Routing fetcher local vs worker distant Zendriver pour
 * bypass DataDome (LBC/SeLoger/Logic-immo). Propage `fetcher_used` pour
 * traçabilité dans `import_logs.fetcher_used`.
 *
 * Usage côté route API :
 *   import { importFromUrl } from "@/lib/import"
 *   const result = await importFromUrl(url)
 */

import type { ImportedAnnonce } from "./types"
import { findParser } from "./parsers"
import { ImportFetchError } from "./fetcher"
import { fetchUrlRouted, type FetcherUsed } from "./fetcher-router"
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
  fetcher_used: FetcherUsed
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
  let fetcherUsed: FetcherUsed
  try {
    const fetched = await fetchUrlRouted(url)
    html = fetched.html
    finalUrl = fetched.final_url
    fetcherUsed = fetched.fetcher_used
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
    fetcher_used: fetcherUsed,
  }
}

/**
 * V97.39.17 — Import depuis HTML brut (bookmarklet "Copier la page").
 *
 * Solution gratuite pour SeLoger / Leboncoin / Logic-immo (sites DataDome
 * impossibles à scraper depuis l'ASN OVH) : l'utilisateur ouvre SA fiche
 * dans son navigateur, clique le bookmarklet KeyMatch, le HTML est copié,
 * puis collé dans le wizard. Le parser tourne ici côté serveur sur le HTML
 * déjà rendu.
 *
 * Bypass 100% car le HTML provient du navigateur de l'utilisateur, pas du
 * worker OVH. Légal car l'utilisateur agit sur SA propre annonce.
 */
export async function importFromHtml(url: string, html: string): Promise<ImportResult> {
  const t0 = Date.now()

  if (!html || typeof html !== "string" || html.length < 200) {
    throw new ImportError("HTML_TOO_SHORT", "Le HTML fourni est vide ou trop court (<200 chars). Re-clique sur le bookmarklet sur la fiche entière.")
  }
  if (html.length > 5 * 1024 * 1024) {
    throw new ImportError("HTML_TOO_LARGE", "Le HTML fait plus de 5 MB. Limite dépassée — la fiche est anormalement lourde.")
  }

  const parser = findParser(url)
  if (!parser) {
    throw new ImportError("NO_PARSER", "Aucun parser ne peut traiter cette URL")
  }

  let parsed: Partial<ImportedAnnonce>
  try {
    parsed = await parser.parse(html, url)
  } catch (e) {
    throw new ImportError("PARSE_ERROR", e instanceof Error ? e.message : "Erreur de parsing")
  }

  const data: ImportedAnnonce = {
    source: parser.name,
    source_url: url,
    ...parsed,
  }

  return {
    data,
    fields_extracted: countFields(data),
    fields_total: FIELDS_TOTAL,
    duration_ms: Date.now() - t0,
    fetcher_used: "bookmarklet",
  }
}

export { SUPPORTED_SITES } from "./parsers"
export type { ImportedAnnonce, ImportSource } from "./types"
