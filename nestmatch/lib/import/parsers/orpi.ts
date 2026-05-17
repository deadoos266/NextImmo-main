/**
 * V97.38 P3-7 — Parser Orpi.
 *
 * Réseau d'agences Orpi.com — JSON-LD absent, OpenGraph riche (titre +
 * surface + pièces format T-N + ville). Pas de protection anti-bot.
 *
 * V97.39.14 — Custom hook pour extraire le nombre de pièces (T-2, T2)
 * et la surface décimale (44.29 m²) depuis og:title Orpi.
 * Format constaté : "Location appartement, 44.29 m² T-2 à Strasbourg, 926 €"
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"
import { extractMeta } from "../helpers"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "orpi.com" || host.endsWith(".orpi.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, {
    siteLabel: "Orpi",
    custom: (htmlBody, out) => {
      // V97.39.14 — Orpi met les détails dans og:title :
      // "Location appartement, 44.29 m² T-2 à Strasbourg, 926 € | Orpi"
      const ogTitle = extractMeta(htmlBody, ["og:title"]) || ""

      // Pièces : pattern "T-N", "T N" ou "TN" → N
      if (!out.rooms) {
        const piecesMatch = /T[\s-]?(\d{1,2})\b/i.exec(ogTitle)
        if (piecesMatch) {
          const n = parseInt(piecesMatch[1], 10)
          if (Number.isFinite(n) && n > 0 && n < 20) out.rooms = n
        }
      }

      // V97.39.15 — Orpi expose un riche `window.dataLayer` côté HTML
      // (Google Tag Manager) avec codePostal, surface format "44-29", etc.
      // Extrait les fields qui ne sont pas dans og:title.
      // Pattern : `dataLayer.push({"codePostal":"67000",...})` ou variantes JSON inline.
      if (!out.postal_code) {
        const cpMatch = /["']codePostal["']\s*:\s*["'](\d{5})["']/i.exec(htmlBody)
        if (cpMatch) {
          const cp = cpMatch[1]
          if (!/^(19|20)\d{2}$/.test(cp)) out.postal_code = cp
        }
      }
      if (!out.bedrooms) {
        const nbChambresMatch = /["']nbChambres["']\s*:\s*["']?(\d{1,2})["']?/i.exec(htmlBody)
        if (nbChambresMatch) {
          const n = parseInt(nbChambresMatch[1], 10)
          if (Number.isFinite(n) && n > 0 && n < 20) out.bedrooms = n
        }
      }
    },
  })
}

export const orpiParser: Parser = {
  name: "orpi",
  label: "Orpi",
  hosts: ["orpi.com"],
  matches,
  parse,
}
