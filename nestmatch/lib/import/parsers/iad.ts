/**
 * V97.38 P3-7 — Parser iAD France.
 *
 * Réseau d'agents indépendants iadfrance.fr — JSON-LD + OG. Pas de
 * protection anti-bot (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "iadfrance.fr" || host === "iadfrance.com" || host.endsWith(".iadfrance.fr") || host.endsWith(".iadfrance.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "iAD France" })
}

export const iadParser: Parser = {
  name: "iad",
  label: "iAD France",
  hosts: ["iadfrance.fr", "iadfrance.com"],
  matches,
  parse,
}
