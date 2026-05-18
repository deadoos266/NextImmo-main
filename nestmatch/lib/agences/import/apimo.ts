/**
 * V97.39.34 — Parser Apimo XML
 *
 * Apimo (Apimo SAS) est le logiciel #1 en France pour les agences immo
 * (couvre ~50% du marché via Century 21, Orpi, Laforêt, etc.).
 *
 * Format du feed export Apimo (simplifié, format réel documenté privé) :
 *
 *   <export>
 *     <listings>
 *       <listing>
 *         <id>12345</id>             ← référence externe Apimo
 *         <reference>REF-001</reference>
 *         <type>1</type>             ← 1=appartement, 2=maison, etc.
 *         <category>2</category>     ← 1=vente, 2=location
 *         <city><name>Paris</name></city>
 *         <postal_code>75011</postal_code>
 *         <address>12 rue X</address>
 *         <price>1200</price>
 *         <charges>50</charges>
 *         <deposit>2400</deposit>    ← caution
 *         <area>45</area>
 *         <rooms>3</rooms>
 *         <bedrooms>2</bedrooms>
 *         <floor>3</floor>
 *         <energy>D</energy>         ← DPE
 *         <description>...</description>
 *         <pictures>
 *           <picture><url>https://...</url></picture>
 *         </pictures>
 *         <options>
 *           <option>FURNISHED</option>
 *           <option>PARKING</option>
 *         </options>
 *       </listing>
 *     </listings>
 *   </export>
 *
 * Note : ce parser est volontairement tolérant. Si Apimo change la structure
 * mineurement, on parse ce qu'on peut et on log les warnings. Mieux vaut
 * importer 47/50 biens que 0/50.
 */

import { XMLParser } from "fast-xml-parser"
import type { ParsedAnnonce } from "./types"

// Mapping codes Apimo → KeyMatch
const TYPE_MAP: Record<string, string> = {
  "1": "Appartement",
  "2": "Maison",
  "3": "Local commercial",
  "4": "Bureau",
  "5": "Terrain",
  "6": "Parking",
  "7": "Studio",
}

// Mapping options Apimo → KeyMatch booleans
const OPTION_MAP: Record<string, keyof ParsedAnnonce> = {
  FURNISHED: "meuble",
  MEUBLE: "meuble",
  FIBRE: "fibre",
  FIBER: "fibre",
  PARKING: "parking",
  GARAGE: "parking",
  CAVE: "cave",
  CELLAR: "cave",
  BALCON: "balcon",
  BALCONY: "balcon",
  TERRASSE: "terrasse",
  TERRACE: "terrasse",
  JARDIN: "jardin",
  GARDEN: "jardin",
  ASCENSEUR: "ascenseur",
  ELEVATOR: "ascenseur",
  LIFT: "ascenseur",
}

function asNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d.,-]/g, "").replace(",", ".")
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function asString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/** Parse XML Apimo → array d'annonces normalisées. */
export function parseApimoXML(xml: string): { annonces: ParsedAnnonce[]; warnings: string[] } {
  const warnings: string[] = []
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: true,
    parseTagValue: false,  // on convertit nous-mêmes via asNumber
  })

  let doc: unknown
  try {
    doc = parser.parse(xml)
  } catch (e) {
    throw new Error(`XML invalide : ${e instanceof Error ? e.message : "parse error"}`)
  }

  // Trouve la racine `listings` (Apimo) ou `properties` (variante export)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = doc as any
  const listings =
    root?.export?.listings?.listing ||
    root?.listings?.listing ||
    root?.export?.properties?.property ||
    root?.properties?.property ||
    null

  if (!listings) {
    throw new Error("Aucune balise <listing> ou <property> trouvée. Format Apimo non reconnu.")
  }

  const items = asArray(listings)
  const annonces: ParsedAnnonce[] = []

  for (let i = 0; i < items.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l: any = items[i]

    // Filter location only (category=2 dans Apimo = location)
    const category = asString(l.category)
    if (category && category !== "2" && category.toLowerCase() !== "location" && category.toLowerCase() !== "rent") {
      warnings.push(`Bien ${i + 1} ignoré (category=${category}, pas une location)`)
      continue
    }

    const typeCode = asString(l.type)
    const typeBien = typeCode && TYPE_MAP[typeCode] ? TYPE_MAP[typeCode] : asString(l.type_label) || "Appartement"

    // Ville : Apimo met dans <city><name>...</name></city>
    const ville = asString(l.city?.name) || asString(l.city) || null

    // Description : parfois CDATA, parfois balise nested <descriptions><description>
    let description: string | null = null
    if (l.description) {
      description = asString(l.description) || asString(l.description?.["#text"]) || null
    } else if (l.descriptions?.description) {
      const desc = l.descriptions.description
      description = asString(Array.isArray(desc) ? desc[0] : desc)
    }

    // Photos : <pictures><picture><url>...</url></picture>...</pictures>
    let photos: string[] | null = null
    if (l.pictures?.picture) {
      const pics = asArray(l.pictures.picture)
      photos = pics
        .map((p: { url?: string } | string) => {
          if (typeof p === "string") return p
          return asString(p.url) || asString((p as { "@_url"?: string })["@_url"]) || null
        })
        .filter((u): u is string => Boolean(u))
      if (photos.length === 0) photos = null
    } else if (l.photos?.photo) {
      const pics = asArray(l.photos.photo)
      photos = pics.map((p: string | { url?: string }) => typeof p === "string" ? p : (p.url || "")).filter(Boolean)
      if (photos.length === 0) photos = null
    }

    // Options → boolean équipements
    const optionsRaw = l.options?.option ?? l.options
    const options = optionsRaw ? asArray(optionsRaw).map(o => (typeof o === "string" ? o : asString(o) || "")).filter(Boolean) : []
    const equipBools: Partial<ParsedAnnonce> = {}
    for (const opt of options) {
      const key = OPTION_MAP[opt.toUpperCase().replace(/[^A-Z]/g, "")]
      if (key) (equipBools as Record<string, boolean>)[key] = true
    }

    const titre = asString(l.title) || asString(l.reference) || `${typeBien} ${ville || ""}`.trim()

    annonces.push({
      external_ref: asString(l.id) || asString(l.reference) || null,
      titre: titre.substring(0, 200),
      description: description?.substring(0, 5000) || null,
      ville,
      code_postal: asString(l.postal_code) || asString(l.zip),
      adresse: asString(l.address) || asString(l.street),
      prix: asNumber(l.price),
      charges: asNumber(l.charges),
      caution: asNumber(l.deposit) || asNumber(l.caution),
      surface: asNumber(l.area) || asNumber(l.surface),
      pieces: asNumber(l.rooms) || asNumber(l.pieces),
      chambres: asNumber(l.bedrooms) || asNumber(l.chambres),
      etage: asNumber(l.floor) || asNumber(l.etage),
      dpe: asString(l.energy) || asString(l.dpe),
      type_bien: typeBien,
      photos,
      ...equipBools,
    })
  }

  return { annonces, warnings }
}
