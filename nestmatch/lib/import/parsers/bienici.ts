/**
 * V97.36 P3-7 — Parser Bien'ici (bienici.com).
 *
 * Bien'ici embarque les données dans `window.__INITIAL_DATA__` ainsi qu'en
 * JSON-LD `RealEstateListing` propre. On utilise les deux en cascade.
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
    return host === "bienici.com" && /\/annonce\//.test(u.pathname)
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  const warnings: string[] = []
  const out: Partial<ImportedAnnonce> = { warnings }

  // 1. JSON-LD principal
  const jsonLd = extractJsonLd(html)
  const listings = findByType(jsonLd, [
    "RealEstateListing", "Apartment", "House", "Residence", "Product", "Place",
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
    if (typeof l.numberOfBedrooms === "number") out.bedrooms = l.numberOfBedrooms

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addr = l.address as any
    if (addr) {
      if (typeof addr.addressLocality === "string") out.city = addr.addressLocality
      if (typeof addr.postalCode === "string") out.postal_code = addr.postalCode
    }
    if (Array.isArray(l.image)) {
      out.photos = (l.image as unknown[]).filter(x => typeof x === "string").slice(0, 12) as string[]
    }
  }

  // 2. __INITIAL_DATA__
  const initMatch = /window\.__INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});\s*</.exec(html)
  if (initMatch) {
    try {
      const data = JSON.parse(initMatch[1])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ad = (data as any).ad || (data as any).listing || null
      if (ad && typeof ad === "object") {
        if (!out.title && typeof ad.title === "string") out.title = ad.title
        if (!out.price && typeof ad.price === "number") out.price = ad.price
        if (!out.surface && typeof ad.surface === "number") out.surface = ad.surface
        if (!out.rooms && typeof ad.roomsQuantity === "number") out.rooms = ad.roomsQuantity
        if (typeof ad.isFurnished === "boolean") out.furnished = ad.isFurnished
        if (typeof ad.floor === "number") out.floor = String(ad.floor)
      }
    } catch { /* noop */ }
  }

  // 3. OG fallback
  if (!out.title) out.title = extractMeta(html, ["og:title", "twitter:title"])
  if (!out.description) out.description = extractMeta(html, ["og:description", "description"])
  if (!out.photos || out.photos.length === 0) {
    const ogImages = extractMetaAll(html, "og:image").filter(Boolean)
    if (ogImages.length > 0) out.photos = ogImages.slice(0, 12)
  }

  if (out.title) out.title = decodeHtmlEntities(out.title).slice(0, 120)
  if (out.description) out.description = decodeHtmlEntities(out.description)

  if (!out.photos || out.photos.length === 0) {
    warnings.push("Photos non importées depuis Bien'ici.")
  }

  return out
}

export const bieniciParser: Parser = {
  name: "bienici",
  label: "Bien'ici",
  hosts: ["bienici.com", "www.bienici.com"],
  matches,
  parse,
}
