/**
 * V97.38 P3-7 — Parser Nestenn.
 *
 * Réseau d'agences nestenn.com — HTML + JSON-LD. Pas de protection
 * anti-bot (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "nestenn.com" || host.endsWith(".nestenn.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "Nestenn" })
}

export const nestennParser: Parser = {
  name: "nestenn",
  label: "Nestenn",
  hosts: ["nestenn.com"],
  matches,
  parse,
}
