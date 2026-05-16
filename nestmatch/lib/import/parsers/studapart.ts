/**
 * V97.38 P3-7 — Parser Studapart.
 *
 * Plateforme location étudiante studapart.com — HTML + OG. Pas de
 * protection anti-bot (testé 2026-05-17). Cible étudiants / jeunes actifs.
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "studapart.com" || host.endsWith(".studapart.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "Studapart" })
}

export const studapartParser: Parser = {
  name: "studapart",
  label: "Studapart",
  hosts: ["studapart.com"],
  matches,
  parse,
}
