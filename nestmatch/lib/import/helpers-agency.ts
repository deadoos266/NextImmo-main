/**
 * V97.38 P3-7 — Helper agence immobilière.
 *
 * Les 12 sites d'agences FR (Foncia, Orpi, iAD, Century 21, Guy Hoquet, ERA,
 * Laforêt, Nestenn, Stéphane Plaza, LocService, Studapart, ImmoJeune)
 * publient leurs annonces avec JSON-LD RealEstateListing + OpenGraph natifs.
 *
 * Ce helper factorise la stratégie d'extraction commune. Chaque parser de
 * site reste un fichier dédié (label + hosts) mais délègue le parsing ici.
 */

import type { ImportedAnnonce } from "./types"
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
} from "./helpers"

export interface AgencyParseOptions {
  /** Label user-facing du site (ex: "Foncia", "Orpi"). Injecté dans le warning. */
  siteLabel: string
  /** Heuristiques regex spécifiques au site (optionnel). */
  custom?: (html: string, out: Partial<ImportedAnnonce>) => void
}

/**
 * Parse le HTML d'une annonce d'agence immobilière FR :
 *  1. JSON-LD RealEstateListing / Apartment / House (Schema.org)
 *  2. OpenGraph / Twitter Card
 *  3. Heuristiques regex prix / surface / DPE (basiques, fallback)
 *  4. Custom hook par site si patterns spécifiques
 *
 * Retourne un Partial<ImportedAnnonce>. Le caller wrap dans son Parser.
 */
export async function parseAgencyHtml(
  html: string,
  opts: AgencyParseOptions,
): Promise<Partial<ImportedAnnonce>> {
  const warnings: string[] = []
  const out: Partial<ImportedAnnonce> = { warnings }

  // 1. JSON-LD
  const jsonLd = extractJsonLd(html)
  const listings = findByType(jsonLd, [
    "RealEstateListing",
    "Apartment",
    "House",
    "Residence",
    "Product",
    "SingleFamilyResidence",
    "Place",
    "Accommodation",
  ])
  if (listings.length > 0) {
    const l = listings[0]
    if (typeof l.name === "string") out.title = l.name
    if (typeof l.description === "string") out.description = l.description

    if (l.offers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer = Array.isArray(l.offers) ? l.offers[0] : (l.offers as any)
      if (offer?.price != null) out.price = parsePrice(String(offer.price))
      if (offer?.priceSpecification && typeof offer.priceSpecification === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ps = offer.priceSpecification as any
        if (!out.price && ps.price != null) out.price = parsePrice(String(ps.price))
      }
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
      if (typeof addr.streetAddress === "string") out.address = addr.streetAddress
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geo = l.geo as any
    if (geo && typeof geo === "object") {
      if (typeof geo.latitude === "number") out.lat = geo.latitude
      if (typeof geo.longitude === "number") out.lng = geo.longitude
    }

    if (Array.isArray(l.image)) {
      out.photos = (l.image as unknown[])
        .filter(x => typeof x === "string")
        .slice(0, 12) as string[]
    } else if (typeof l.image === "string") {
      out.photos = [l.image]
    }
  }

  // 2. OpenGraph fallback
  if (!out.title) out.title = extractMeta(html, ["og:title", "twitter:title"]) || extractTitle(html)
  if (!out.description) {
    out.description = extractMeta(html, ["og:description", "twitter:description", "description"])
  }
  if (!out.photos || out.photos.length === 0) {
    const ogImages = extractMetaAll(html, "og:image").filter(Boolean)
    if (ogImages.length > 0) out.photos = ogImages.slice(0, 12)
  }

  // 3. Heuristiques regex (basiques, premiere occurrence)
  if (!out.price) {
    const m = /(\d[\d\s ]*(?:[.,]\d+)?)\s*€\s*(?:\/\s*mois|cc|hc|charges)?/i.exec(html)
    if (m) out.price = parsePrice(m[1])
  }
  if (!out.surface) {
    const m = /(\d+(?:[.,]\d+)?)\s*m²/i.exec(html)
    if (m) out.surface = parseSurface(m[1])
  }
  if (!out.rooms) {
    const m = /(\d+)\s*pi[èe]ces?/i.exec(html)
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > 0 && n < 20) out.rooms = n
    }
  }
  if (!out.dpe) {
    const m = /classe\s*(?:énerg(?:ie|étique)|DPE)\s*:?\s*([A-G])/i.exec(html)
    if (m) out.dpe = normalizeDpe(m[1])
  }

  // 4. Hook custom du site
  if (opts.custom) {
    try {
      opts.custom(html, out)
    } catch {
      // Custom hook a planté, on garde ce qu'on a déjà
    }
  }

  // Nettoyage final
  if (out.title) out.title = decodeHtmlEntities(out.title).slice(0, 120)
  if (out.description) out.description = decodeHtmlEntities(out.description)

  warnings.push(
    `Source ${opts.siteLabel} : extraction via JSON-LD/OpenGraph. Vérifie les champs et complète manuellement avant de publier.`,
  )
  warnings.push(
    "Photos hébergées sur le site source — pour qu'elles restent disponibles, télécharge-les et re-upload dans le formulaire.",
  )

  return out
}
