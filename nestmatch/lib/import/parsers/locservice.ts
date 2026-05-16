/**
 * V97.38 P3-7 — Parser LocService.
 *
 * Site location entre particuliers locservice.fr — HTML server-rendered,
 * pas de protection anti-bot (testé 2026-05-17). Spécialisé location
 * meublée / colocation.
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "locservice.fr" || host.endsWith(".locservice.fr")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "LocService" })
}

export const locserviceParser: Parser = {
  name: "locservice",
  label: "LocService",
  hosts: ["locservice.fr"],
  matches,
  parse,
}
