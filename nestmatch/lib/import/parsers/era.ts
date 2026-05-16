/**
 * V97.38 P3-7 — Parser ERA Immobilier.
 *
 * Réseau d'agences eraimmobilier.com (redirige depuis erafrance.com).
 * HTML + OG, pas de protection anti-bot (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return (
      host === "eraimmobilier.com" ||
      host === "erafrance.com" ||
      host.endsWith(".eraimmobilier.com") ||
      host.endsWith(".erafrance.com")
    )
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "ERA Immobilier" })
}

export const eraParser: Parser = {
  name: "era",
  label: "ERA Immobilier",
  hosts: ["eraimmobilier.com", "erafrance.com"],
  matches,
  parse,
}
