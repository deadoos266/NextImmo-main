/**
 * V97.38 P3-7 — Parser Century 21.
 *
 * Réseau d'agences century21.fr — JSON-LD + OG. Pas de protection anti-bot
 * (testé 2026-05-17). Les URLs slugs peuvent changer (formats divers).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

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
  return parseAgencyHtml(html, { siteLabel: "Century 21" })
}

export const century21Parser: Parser = {
  name: "century21",
  label: "Century 21",
  hosts: ["century21.fr"],
  matches,
  parse,
}
