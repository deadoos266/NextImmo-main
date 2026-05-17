/**
 * V97.38 P3-7 — Parser Century 21.
 *
 * Réseau d'agences century21.fr — OpenGraph riche (entités HTML décodées).
 * Pas de protection anti-bot (testé 2026-05-17).
 *
 * V97.39.14 — Custom hook pour parser le format og:title C21 :
 * "Appartement F2 à louer - 2 pièces - 42 m2 - Paris - 75012 - ILE-DE-FRANCE"
 * → extract code postal, ville
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"
import { extractMeta } from "../helpers"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "century21.fr" || host.endsWith(".century21.fr")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, {
    siteLabel: "Century 21",
    custom: (htmlBody, out) => {
      const ogTitle = extractMeta(htmlBody, ["og:title"]) || ""

      // V97.39.14 — code postal FR (5 chiffres) dans og:title Century 21
      if (!out.postal_code) {
        const cpMatch = /\b(\d{5})\b/.exec(ogTitle)
        if (cpMatch) {
          const cp = cpMatch[1]
          // Sanity check : CP FR commence par 0-9, exclut années (19xx-20xx)
          if (!/^(19|20)\d{2}$/.test(cp)) {
            out.postal_code = cp
          }
        }
      }

      // V97.39.14 — Si pas de city, essayer "- VILLE - 75012 -" entre dashes
      if (!out.city) {
        const cityMatch = /-\s*([A-Z][A-Za-zéèêëàâäçîïôöùûü\s\-']+)\s*-\s*\d{5}/.exec(ogTitle)
        if (cityMatch) {
          out.city = cityMatch[1].trim()
        }
      }

      // V97.39.15 — Century 21 utilise le format français "F2", "F3" (pas T-N comme Orpi)
      // og:title : "Appartement F2 à louer - 2 pièces - 42 m2..."
      if (!out.rooms) {
        const piecesMatch = /\bF[\s-]?(\d{1,2})\b/i.exec(ogTitle)
        if (piecesMatch) {
          const n = parseInt(piecesMatch[1], 10)
          if (Number.isFinite(n) && n > 0 && n < 20) out.rooms = n
        }
      }
    },
  })
}

export const century21Parser: Parser = {
  name: "century21",
  label: "Century 21",
  hosts: ["century21.fr"],
  matches,
  parse,
}
