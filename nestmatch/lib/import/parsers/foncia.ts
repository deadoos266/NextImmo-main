/**
 * V97.38 P3-7 — Parser Foncia.
 *
 * Foncia publie ses biens sur fr.foncia.com avec JSON-LD `apartment`
 * (minuscule — case-insensitive depuis V97.39.12) et OpenGraph.
 * Pas de protection anti-bot (testé 2026-05-17).
 *
 * V97.39.14 — Custom hook pour extraire le DPE depuis le HTML body Foncia.
 * Foncia affiche le DPE dans un widget `<div class="dpe">` avec lettre A-G
 * comme contenu texte.
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"
import { normalizeDpe } from "../helpers"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "foncia.com" || host === "fr.foncia.com" || host.endsWith(".foncia.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, {
    siteLabel: "Foncia",
    custom: (htmlBody, out) => {
      // V97.39.14 — Foncia met le DPE dans des balises avec class spécifique
      // Patterns observés : `data-dpe-letter="C"`, `class="dpe-grade-C"`,
      // ou directement `<span class="dpe">C</span>`.
      if (!out.dpe) {
        const patterns: RegExp[] = [
          /data-dpe[^=]*=["']([A-G])["']/i,
          /class=["'][^"']*dpe[-_]grade[-_]([A-G])\b/i,
          /class=["'][^"']*dpe[-_]letter[-_]([A-G])\b/i,
        ]
        for (const re of patterns) {
          const m = re.exec(htmlBody)
          if (m) {
            const dpe = normalizeDpe(m[1])
            if (dpe) {
              out.dpe = dpe
              break
            }
          }
        }
      }
    },
  })
}

export const fonciaParser: Parser = {
  name: "foncia",
  label: "Foncia",
  hosts: ["foncia.com", "fr.foncia.com"],
  matches,
  parse,
}
