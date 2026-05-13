/**
 * V97.36 P3-7 — Parser PAP (Particulier à Particulier).
 *
 * PAP utilise du HTML structuré ancien-style + JSON-LD partiel.
 * Stratégie : JSON-LD si dispo, sinon regex sur les classes CSS connues
 * (.item-price, .item-surface, etc.). Best-effort, peut casser si PAP
 * change son markup — d'où le fallback OG et le warning.
 *
 * Si Paul reçoit beaucoup d'imports PAP qui échouent, ajouter une
 * stratégie regex plus robuste ou marquer ce parser MVP-only.
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
  normalizeDpe,
} from "../helpers"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "pap.fr" && /\/annonces\//.test(u.pathname)
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  const warnings: string[] = []
  const out: Partial<ImportedAnnonce> = { warnings }

  // 1. JSON-LD si présent
  const jsonLd = extractJsonLd(html)
  const listings = findByType(jsonLd, ["RealEstateListing", "Apartment", "House", "Residence", "Product"])
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

  // 2. Regex sur classes PAP connues (.item-price, .item-summary, etc.)
  if (!out.price) {
    const m = /<[^>]*class=["'][^"']*item-price[^"']*["'][^>]*>\s*([^<]+)</i.exec(html)
    if (m) out.price = parsePrice(m[1])
  }
  if (!out.surface) {
    const m = /(\d+(?:[.,]\d+)?)\s*m²/i.exec(html)
    if (m) out.surface = parseSurface(m[1])
  }
  if (!out.dpe) {
    const m = /classe\s*énerg(?:ie|étique)\s*:?\s*([A-G])/i.exec(html)
    if (m) out.dpe = normalizeDpe(m[1])
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

  warnings.push("Source PAP : extraction best-effort. Vérifie les champs avant de publier.")

  return out
}

export const papParser: Parser = {
  name: "pap",
  label: "PAP",
  hosts: ["pap.fr", "www.pap.fr"],
  matches,
  parse,
}
