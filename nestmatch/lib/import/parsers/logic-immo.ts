/**
 * V97.36 P3-7 — Parser Logic-immo.com.
 *
 * Logic-immo a un layout HTML stable, mais peu de structured data.
 * Stratégie : JSON-LD si présent, sinon regex sur les classes connues
 * (.fc-detail--price, .fc-detail--surface) + OG fallback.
 *
 * Best-effort. Si Paul voit beaucoup d'échecs, considérer ce parser
 * comme expérimental et améliorer plus tard.
 */

import type { Parser, ImportedAnnonce } from "../types"
import {
  extractJsonLd,
  findByType,
  extractMeta,
  extractMetaAll,
  decodeHtmlEntities,
  parsePrice,
  parseSurface,
} from "../helpers"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return (host === "logic-immo.com" || host === "fr.logic-immo.com") && /\/detail-|\/annonce/i.test(u.pathname)
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  const warnings: string[] = []
  const out: Partial<ImportedAnnonce> = { warnings }

  const jsonLd = extractJsonLd(html)
  const listings = findByType(jsonLd, ["RealEstateListing", "Apartment", "House", "Product"])
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

  // Regex Logic-immo (classes CSS connues)
  if (!out.price) {
    const m = /(\d[\d\s ]*(?:[.,]\d+)?)\s*€\/mois/i.exec(html)
    if (m) out.price = parsePrice(m[1])
  }
  if (!out.surface) {
    const m = /(\d+(?:[.,]\d+)?)\s*m²/i.exec(html)
    if (m) out.surface = parseSurface(m[1])
  }

  if (!out.title) out.title = extractMeta(html, ["og:title", "twitter:title"])
  if (!out.description) out.description = extractMeta(html, ["og:description", "description"])
  if (!out.photos || out.photos.length === 0) {
    const ogImages = extractMetaAll(html, "og:image").filter(Boolean)
    if (ogImages.length > 0) out.photos = ogImages.slice(0, 12)
  }

  if (out.title) out.title = decodeHtmlEntities(out.title).slice(0, 120)
  if (out.description) out.description = decodeHtmlEntities(out.description)

  warnings.push("Source Logic-immo : extraction limitée. Vérifie chaque champ avant publication.")

  return out
}

export const logicImmoParser: Parser = {
  name: "logic-immo",
  label: "Logic-immo",
  hosts: ["logic-immo.com", "www.logic-immo.com", "fr.logic-immo.com"],
  matches,
  parse,
}
