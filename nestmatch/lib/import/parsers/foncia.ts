/**
 * V97.38 P3-7 — Parser Foncia.
 *
 * Foncia publie ses biens sur fr.foncia.com avec JSON-LD RealEstateListing
 * et OpenGraph. Pas de protection anti-bot (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

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
  return parseAgencyHtml(html, { siteLabel: "Foncia" })
}

export const fonciaParser: Parser = {
  name: "foncia",
  label: "Foncia",
  hosts: ["foncia.com", "fr.foncia.com"],
  matches,
  parse,
}
