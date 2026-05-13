/**
 * V97.36 P3-7 — Parser Leboncoin (locations).
 *
 * Leboncoin embarque les données structurées de plusieurs façons :
 *  1. JSON-LD type `RealEstateListing` ou `Product` (selon les versions)
 *  2. Un blob Next.js `<script id="__NEXT_DATA__">{...}</script>` qui
 *     contient `props.pageProps.ad` avec tous les détails (le plus fiable)
 *  3. Open Graph en fallback (titre, description, photo)
 *
 * On essaie dans cet ordre, on merge les données.
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

const HOSTS = ["leboncoin.fr", "www.leboncoin.fr"]

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "leboncoin.fr" && /\/ad\/|\/locations\//.test(u.pathname)
  } catch {
    return false
  }
}

function extractNextData(html: string): unknown {
  const m = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function get(obj: any, path: string): any {
  return path.split(".").reduce((acc, k) => acc?.[k], obj)
}

async function parse(html: string, url: string): Promise<Partial<ImportedAnnonce>> {
  const warnings: string[] = []
  const out: Partial<ImportedAnnonce> = { warnings }

  // 1. __NEXT_DATA__
  const next = extractNextData(html)
  const ad = get(next, "props.pageProps.ad") ?? get(next, "props.pageProps.adData") ?? null

  if (ad && typeof ad === "object") {
    if (typeof ad.subject === "string") out.title = ad.subject
    if (typeof ad.body === "string") out.description = ad.body
    if (typeof ad.price === "number") out.price = ad.price
    else if (Array.isArray(ad.price) && typeof ad.price[0] === "number") out.price = ad.price[0]

    // Attributs : tableau d'objets { key, value, value_label }
    const attrs: Array<{ key: string; value: string; value_label?: string }> =
      Array.isArray(ad.attributes) ? ad.attributes : []
    const byKey: Record<string, string> = {}
    for (const a of attrs) {
      if (a && typeof a.key === "string") {
        byKey[a.key] = typeof a.value === "string" ? a.value : (a.value_label || "")
      }
    }

    if (byKey.square) out.surface = parseSurface(byKey.square)
    if (byKey.rooms) out.rooms = Number(byKey.rooms) || undefined
    if (byKey.real_estate_type) out.property_type = mapPropertyType(byKey.real_estate_type)
    if (byKey.furnished) out.furnished = /meuble|furnished|oui|yes/i.test(byKey.furnished)
    if (byKey.energy_rate) out.dpe = normalizeDpe(byKey.energy_rate)
    if (byKey.charges_included) {
      // valeur "1" = charges comprises
    }
    if (byKey.monthly_rent) out.price = parsePrice(byKey.monthly_rent)
    if (byKey.charges_amount) out.charges = parsePrice(byKey.charges_amount)
    if (byKey.deposit) out.deposit = parsePrice(byKey.deposit)
    if (byKey.floor_number) out.floor = byKey.floor_number

    // Localisation
    const loc = ad.location || {}
    if (typeof loc.city === "string") out.city = loc.city
    if (typeof loc.zipcode === "string") out.postal_code = loc.zipcode
    if (typeof loc.lat === "number") out.lat = loc.lat
    if (typeof loc.lng === "number") out.lng = loc.lng

    // Photos
    const images: unknown = ad.images
    if (images && typeof images === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const urls: string[] = ((images as any).urls || (images as any).urls_large || []) as string[]
      if (Array.isArray(urls)) {
        out.photos = urls.filter(u => typeof u === "string").slice(0, 12)
      }
    }

    // Équipements depuis attrs (best-effort)
    const equipments: string[] = []
    for (const [k, v] of Object.entries(byKey)) {
      if (v === "1" || /oui|yes|true/i.test(v)) {
        if (/parking/i.test(k)) equipments.push("parking")
        else if (/balcon|balcony/i.test(k)) equipments.push("balcon")
        else if (/terrasse|terrace/i.test(k)) equipments.push("terrasse")
        else if (/cave|cellar/i.test(k)) equipments.push("cave")
        else if (/ascenseur|elevator/i.test(k)) equipments.push("ascenseur")
        else if (/jardin|garden/i.test(k)) equipments.push("jardin")
        else if (/fibre|optic/i.test(k)) equipments.push("fibre")
      }
    }
    if (equipments.length > 0) out.equipments = Array.from(new Set(equipments))

    if (typeof ad.list_id === "number" || typeof ad.list_id === "string") {
      out.source_id = String(ad.list_id)
    }
  }

  // 2. JSON-LD fallback
  const jsonLd = extractJsonLd(html)
  const listings = findByType(jsonLd, ["RealEstateListing", "Product", "Apartment", "House", "Residence"])
  if (listings.length > 0) {
    const l = listings[0]
    if (!out.title && typeof l.name === "string") out.title = l.name
    if (!out.description && typeof l.description === "string") out.description = l.description
    if (!out.price && l.offers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer = Array.isArray(l.offers) ? l.offers[0] : (l.offers as any)
      if (offer && typeof offer.price !== "undefined") {
        out.price = parsePrice(String(offer.price))
      }
    }
    if (!out.surface && l.floorSize) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fs = l.floorSize as any
      out.surface = parseSurface(String(fs.value ?? fs))
    }
    if (!out.rooms && typeof l.numberOfRooms === "number") out.rooms = l.numberOfRooms
  }

  // 3. OG fallback
  if (!out.title) out.title = extractMeta(html, ["og:title", "twitter:title"])
  if (!out.description) out.description = extractMeta(html, ["og:description", "description"])
  if (!out.photos || out.photos.length === 0) {
    const ogImages = extractMetaAll(html, "og:image").filter(Boolean)
    if (ogImages.length > 0) out.photos = ogImages.slice(0, 12)
  }

  // Limites
  if (out.title) out.title = decodeHtmlEntities(out.title).slice(0, 120)
  if (out.description) out.description = decodeHtmlEntities(out.description)

  if (!out.photos || out.photos.length === 0) {
    warnings.push("Photos non importées depuis Leboncoin (à uploader manuellement).")
  }

  return out
}

function mapPropertyType(s: string): string {
  const c = s.toLowerCase()
  if (/maison/i.test(c)) return "Maison"
  if (/studio/i.test(c)) return "Studio"
  if (/loft/i.test(c)) return "Loft"
  if (/appart|apt/i.test(c)) return "Appartement"
  return "Appartement"
}

export const leboncoinParser: Parser = {
  name: "leboncoin",
  label: "Leboncoin",
  hosts: HOSTS,
  matches,
  parse,
}
