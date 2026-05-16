/**
 * V97.38 P3-7 — Parser Orpi.
 *
 * Réseau d'agences Orpi.com — JSON-LD + OG. Pas de protection anti-bot
 * (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

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
  return parseAgencyHtml(html, { siteLabel: "Orpi" })
}

export const orpiParser: Parser = {
  name: "orpi",
  label: "Orpi",
  hosts: ["orpi.com"],
  matches,
  parse,
}
