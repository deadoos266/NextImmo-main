/**
 * V97.36 P3-7 — Parser SeLoger.com (locations).
 *
 * SeLoger expose ses données via :
 *  1. JSON-LD `RealEstateListing` (le plus structuré, classique Schema.org)
 *  2. `window.__INITIAL_STATE__` ou `<script id="__NEXT_DATA__">` selon les pages
 *  3. Open Graph + microdata
 *
 * Note : SeLoger varie son HTML selon la version (mobile/desktop/redirect),
 * on fait du best-effort sur les 3 sources.
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

const HOSTS = ["seloger.com", "www.seloger.com"]

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "seloger.com" && /\/annonces?\//.test(u.pathname)
  } catch {
    return false
  }
}

function extractInitialState(html: string): unknown {
  // Pattern : window.__INITIAL_STATE__ = JSON.parse('...');
  const m1 = /window\.__INITIAL_STATE__\s*=\s*JSON\.parse\(["']((?:[^"\\]|\\.)*)["']\)/.exec(html)
  if (m1) {
    try {
      // JSON.parse('escaped string') — déescape les \" \\ \n
      const raw = m1[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n")
      return JSON.parse(raw)
    } catch { /* noop */ }
  }
  // Pattern direct : window.__INITIAL_STATE__ = {...}
  const m2 = /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*</.exec(html)
  if (m2) {
    try { return JSON.parse(m2[1]) } catch { /* noop */ }
  }
  return null
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  const warnings: string[] = []
  const out: Partial<ImportedAnnonce> = { warnings }

  // 1. JSON-LD (le plus fiable sur SeLoger)
  const jsonLd = extractJsonLd(html)
  const listings = findByType(jsonLd, [
    "RealEstateListing", "Product", "Apartment", "House", "Residence", "SingleFamilyResidence",
  ])
  if (listings.length > 0) {
    const l = listings[0]
    if (typeof l.name === "string") out.title = l.name
    if (typeof l.description === "string") out.description = l.description

    // Prix
    if (l.offers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer = Array.isArray(l.offers) ? l.offers[0] : (l.offers as any)
      if (offer && offer.price != null) out.price = parsePrice(String(offer.price))
    }

    // Surface
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = l.floorSize as any
    if (fs) {
      const val = fs.value ?? fs
      out.surface = parseSurface(String(val))
    }

    if (typeof l.numberOfRooms === "number") out.rooms = l.numberOfRooms
    else if (typeof l.numberOfRooms === "string") out.rooms = Number(l.numberOfRooms) || undefined

    if (typeof l.numberOfBedrooms === "number") out.bedrooms = l.numberOfBedrooms

    // Address
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addr = l.address as any
    if (addr) {
      if (typeof addr.addressLocality === "string") out.city = addr.addressLocality
      if (typeof addr.postalCode === "string") out.postal_code = addr.postalCode
      if (typeof addr.streetAddress === "string") out.address = addr.streetAddress
    }

    // GeoCoordinates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geo = l.geo as any
    if (geo) {
      if (typeof geo.latitude === "number") out.lat = geo.latitude
      if (typeof geo.longitude === "number") out.lng = geo.longitude
    }

    // Photos
    const imgs: unknown = l.image
    if (Array.isArray(imgs)) {
      out.photos = imgs.filter(x => typeof x === "string").slice(0, 12) as string[]
    } else if (typeof imgs === "string") {
      out.photos = [imgs]
    }

    // DPE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((l as any).energyEfficiencyScaleMin) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.dpe = normalizeDpe((l as any).energyEfficiencyScaleMin)
    }
  }

  // 2. __INITIAL_STATE__ pour enrichir
  const state = extractInitialState(html)
  if (state && typeof state === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state as any
    const ad = s.listingData || s.ad || s.detail || null
    if (ad && typeof ad === "object") {
      if (!out.title && typeof ad.title === "string") out.title = ad.title
      if (!out.description && typeof ad.description === "string") out.description = ad.description
      if (!out.price && typeof ad.price === "number") out.price = ad.price
      if (!out.surface && typeof ad.surface === "number") out.surface = ad.surface
      if (!out.rooms && typeof ad.rooms === "number") out.rooms = ad.rooms
      if (typeof ad.charges === "number") out.charges = ad.charges
      if (typeof ad.deposit === "number") out.deposit = ad.deposit
      if (typeof ad.furnished === "boolean") out.furnished = ad.furnished
      if (typeof ad.floor === "string" || typeof ad.floor === "number") out.floor = String(ad.floor)
      if (typeof ad.city === "string" && !out.city) out.city = ad.city
      if (typeof ad.zipCode === "string" && !out.postal_code) out.postal_code = ad.zipCode

      // Équipements
      const equipments: string[] = []
      const flags = ad.features || ad.options || {}
      if (typeof flags === "object" && flags) {
        for (const [k, v] of Object.entries(flags)) {
          if (v === true || v === "true" || v === 1) {
            if (/parking|garage/i.test(k)) equipments.push("parking")
            else if (/balcon/i.test(k)) equipments.push("balcon")
            else if (/terrasse/i.test(k)) equipments.push("terrasse")
            else if (/cave/i.test(k)) equipments.push("cave")
            else if (/ascenseur|elevator/i.test(k)) equipments.push("ascenseur")
            else if (/jardin/i.test(k)) equipments.push("jardin")
            else if (/fibre/i.test(k)) equipments.push("fibre")
          }
        }
      }
      if (equipments.length > 0) {
        out.equipments = Array.from(new Set([...(out.equipments || []), ...equipments]))
      }
    }
  }

  // 3. OG fallback
  if (!out.title) out.title = extractMeta(html, ["og:title", "twitter:title"])
  if (!out.description) out.description = extractMeta(html, ["og:description", "description"])
  if (!out.photos || out.photos.length === 0) {
    const ogImages = extractMetaAll(html, "og:image").filter(Boolean)
    if (ogImages.length > 0) out.photos = ogImages.slice(0, 12)
  }

  // 4. Regex meta typiques SeLoger
  if (!out.price) {
    const m = /<meta[^>]+name=["']listingPrice["'][^>]+content=["']([^"']+)["']/i.exec(html)
    if (m) out.price = parsePrice(m[1])
  }
  if (!out.surface) {
    const m = /<meta[^>]+name=["']listingSurface["'][^>]+content=["']([^"']+)["']/i.exec(html)
    if (m) out.surface = parseSurface(m[1])
  }

  // Limites
  if (out.title) out.title = decodeHtmlEntities(out.title).slice(0, 120)
  if (out.description) out.description = decodeHtmlEntities(out.description)

  if (!out.photos || out.photos.length === 0) {
    warnings.push("Photos non importées depuis SeLoger (à uploader manuellement).")
  }
  if (!out.price) {
    warnings.push("Prix non détecté — à saisir manuellement.")
  }

  return out
}

export const selogerParser: Parser = {
  name: "seloger",
  label: "SeLoger",
  hosts: HOSTS,
  matches,
  parse,
}
