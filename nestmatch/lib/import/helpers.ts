/**
 * V97.36 P3-7 — Helpers communs aux parsers (regex extracteurs).
 *
 * Pas de jsdom/cheerio en runtime (trop lourd, surface d'attaque) : on
 * reste sur regex + JSON-LD parser standard. Suffisant pour récupérer
 *  - les script JSON-LD type Schema.org
 *  - les meta tags (OpenGraph, Twitter Card, name)
 *  - les data attributes simples
 */

import type { ImportedAnnonce } from "./types"

/**
 * Extrait tous les blocs `<script type="application/ld+json">...</script>`
 * et parse leur contenu. Ignore les erreurs JSON individuelles.
 *
 * V97.39.12 — Retry avec décodage entités HTML si le 1er JSON.parse échoue.
 * Certains sites (Guy Hoquet notamment) écrivent `&lt;br /&gt;` ou `&quot;`
 * littéralement dans les valeurs string du JSON, ce qui casse JSON.parse.
 * On tente alors un decode des entités avant retry.
 */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const raw = m[1].trim()
    if (!raw) continue

    const pushParsed = (parsed: unknown) => {
      if (Array.isArray(parsed)) out.push(...parsed)
      else if (parsed && typeof parsed === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (parsed as any)["@graph"]
        if (Array.isArray(g)) out.push(...g)
        else out.push(parsed)
      }
    }

    try {
      pushParsed(JSON.parse(raw))
    } catch {
      // V97.39.12 — retry après decode des entités HTML
      // (Guy Hoquet écrit &lt;br /&gt; et &quot; dans les strings JSON)
      try {
        const decoded = decodeHtmlEntities(raw)
        pushParsed(JSON.parse(decoded))
      } catch {
        // JSON-LD vraiment malformé, on ignore
      }
    }
  }
  return out
}

/**
 * Filtre les nodes JSON-LD qui matchent un @type donné.
 * Supporte type unique ou tableau de types.
 *
 * V97.39.12 — match CASE-INSENSITIVE car certains sites (Foncia notamment)
 * émettent `@type: "apartment"` minuscule au lieu de `"Apartment"` Schema.org.
 * Sans ce fix, le parser ignorait le JSON-LD valide et tombait en fallback OG.
 */
export function findByType(nodes: unknown[], type: string | string[]): Record<string, unknown>[] {
  const types = (Array.isArray(type) ? type : [type]).map(t => t.toLowerCase())
  const out: Record<string, unknown>[] = []
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue
    const t = (n as Record<string, unknown>)["@type"]
    if (typeof t === "string" && types.includes(t.toLowerCase())) {
      out.push(n as Record<string, unknown>)
    } else if (Array.isArray(t) && t.some(x => typeof x === "string" && types.includes(x.toLowerCase()))) {
      out.push(n as Record<string, unknown>)
    }
  }
  return out
}

/**
 * Extrait une meta tag <meta property="..." content="..." /> ou
 * <meta name="..." content="..." />.
 */
export function extractMeta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const reProp = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegex(key)}["'][^>]*content=["']([^"']+)["']`,
      "i",
    )
    const reReverse = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRegex(key)}["']`,
      "i",
    )
    const m1 = reProp.exec(html)
    if (m1) return decodeHtmlEntities(m1[1])
    const m2 = reReverse.exec(html)
    if (m2) return decodeHtmlEntities(m2[1])
  }
  return undefined
}

/**
 * Extrait toutes les meta tags d'un même nom (ex: og:image multiple).
 */
export function extractMetaAll(html: string, key: string): string[] {
  const out: string[] = []
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegex(key)}["'][^>]*content=["']([^"']+)["']`,
    "gi",
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.push(decodeHtmlEntities(m[1]))
  return out
}

/**
 * Extrait le contenu d'un <title>...</title>.
 */
export function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decodeHtmlEntities(m[1].trim()) : undefined
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

/**
 * Parse un prix en € depuis une string (peut contenir des espaces insécables,
 * "€/mois", "CC", etc.). Retourne undefined si pas un nombre valide.
 */
export function parsePrice(s: string | undefined | null): number | undefined {
  if (!s) return undefined
  const cleaned = String(s).replace(/[^\d,.]/g, "").replace(",", ".")
  if (!cleaned) return undefined
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/**
 * Parse une surface en m² (ignore les unités, accepte décimales).
 */
export function parseSurface(s: string | undefined | null): number | undefined {
  if (!s) return undefined
  const cleaned = String(s).replace(/[^\d,.]/g, "").replace(",", ".")
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/**
 * Normalise un DPE en classe A-G stricte. Renvoie undefined si invalide.
 */
export function normalizeDpe(s: string | undefined | null): ImportedAnnonce["dpe"] | undefined {
  if (!s) return undefined
  const c = String(s).trim().toUpperCase()
  if (["A", "B", "C", "D", "E", "F", "G"].includes(c)) return c as ImportedAnnonce["dpe"]
  // Patterns type "Classe énergie : C"
  const m = /\b([A-G])\b/.exec(c)
  if (m) return m[1] as ImportedAnnonce["dpe"]
  return undefined
}

/**
 * Compte les fields renseignés dans un Partial<ImportedAnnonce>
 * (helper pour les stats import_logs).
 */
export function countFields(data: Partial<ImportedAnnonce>): number {
  let n = 0
  const keys: (keyof ImportedAnnonce)[] = [
    "title", "description", "price", "charges", "deposit", "surface", "rooms",
    "bedrooms", "floor", "furnished", "dpe", "property_type", "city", "postal_code",
    "address", "available_from", "lat", "lng",
  ]
  for (const k of keys) {
    const v = data[k]
    if (v !== undefined && v !== null && v !== "") n++
  }
  if (data.photos && data.photos.length > 0) n++
  if (data.equipments && data.equipments.length > 0) n++
  return n
}

/** Référence : 20 fields qu'on essaie d'extraire. */
export const FIELDS_TOTAL = 20
