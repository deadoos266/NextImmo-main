/**
 * V97.36 P3-7 — Parser générique fallback.
 *
 * Toujours en dernière position. Matche n'importe quelle URL HTTPS et tente :
 *  1. JSON-LD `RealEstateListing` ou Schema.org typé immobilier
 *  2. Open Graph + Twitter Card
 *  3. Heuristique regex sur le body (prix / surface / DPE)
 *
 * Warning explicite à l'user : source non reconnue, données limitées.
 */

import type { Parser, ImportedAnnonce } from "../types"
import {
  extractJsonLd,
  findByType,
  extractMeta,
  extractMetaAll,
  extractTitle,
  decodeHtmlEntities,
  parsePrice,
  parseSurface,
  normalizeDpe,
} from "../helpers"

function matches(_url: string): boolean {
  return true  // fallback, on est toujours dernier dans l'array
}

async function parse(html: string, url: string): Promise<Partial<ImportedAnnonce>> {
  const warnings: string[] = []
  const out: Partial<ImportedAnnonce> = { warnings }

  // 1. JSON-LD éventuel
  const jsonLd = extractJsonLd(html)
  const listings = findByType(jsonLd, [
    "RealEstateListing", "Apartment", "House", "Residence", "Product", "SingleFamilyResidence", "Place",
  ])
  if (listings.length > 0) {
    const l = listings[0]
    if (typeof l.name === "string") out.title = l.name
    if (typeof l.description === "string") out.description = l.description

    if (l.offers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer = Array.isArray(l.offers) ? l.offers[0] : (l.offers as any)
      if (offer?.price != null) out.price = parsePrice(String(offer.price))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = l.floorSize as any
    if (fs) out.surface = parseSurface(String(fs.value ?? fs))
    if (typeof l.numberOfRooms === "number") out.rooms = l.numberOfRooms

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addr = l.address as any
    if (addr) {
      if (typeof addr.addressLocality === "string") out.city = addr.addressLocality
      if (typeof addr.postalCode === "string") out.postal_code = addr.postalCode
    }
    if (Array.isArray(l.image)) out.photos = (l.image as unknown[]).filter(x => typeof x === "string").slice(0, 12) as string[]
  }

  // 2. Open Graph + meta
  if (!out.title) out.title = extractMeta(html, ["og:title", "twitter:title"]) || extractTitle(html)
  if (!out.description) out.description = extractMeta(html, ["og:description", "twitter:description", "description"])
  if (!out.photos || out.photos.length === 0) {
    const ogImages = extractMetaAll(html, "og:image").filter(Boolean)
    if (ogImages.length > 0) out.photos = ogImages.slice(0, 12)
  }

  // 3. Heuristique regex (prudent, premiere occurence dans le HTML)
  if (!out.price) {
    const m = /(\d[\d\s ]*(?:[.,]\d+)?)\s*€\s*(?:\/\s*mois|cc|hc|charges)/i.exec(html)
    if (m) out.price = parsePrice(m[1])
  }
  if (!out.surface) {
    const m = /(\d+(?:[.,]\d+)?)\s*m²/i.exec(html)
    if (m) out.surface = parseSurface(m[1])
  }
  if (!out.dpe) {
    const m = /classe\s*(?:énerg(?:ie|étique)|DPE)\s*:?\s*([A-G])/i.exec(html)
    if (m) out.dpe = normalizeDpe(m[1])
  }

  if (out.title) out.title = decodeHtmlEntities(out.title).slice(0, 120)
  if (out.description) out.description = decodeHtmlEntities(out.description)

  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    warnings.push(
      `Source non reconnue (${host}). Quelques champs ont été extraits via les méta-données — complète et vérifie le formulaire avant publication.`,
    )
  } catch {
    warnings.push("Source non reconnue — données limitées, complète manuellement.")
  }

  return out
}

export const genericOgParser: Parser = {
  name: "generic",
  label: "Source générique",
  hosts: ["*"],
  matches,
  parse,
}
