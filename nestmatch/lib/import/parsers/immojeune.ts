/**
 * V97.38 P3-7 — Parser ImmoJeune.
 *
 * Plateforme location étudiante immojeune.com — HTML + OG. Pas de
 * protection anti-bot (testé 2026-05-17). Cible étudiants.
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "immojeune.com" || host.endsWith(".immojeune.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "ImmoJeune" })
}

export const immojeuneParser: Parser = {
  name: "immojeune",
  label: "ImmoJeune",
  hosts: ["immojeune.com"],
  matches,
  parse,
}
