/**
 * V97.38 P3-7 — Parser Stéphane Plaza Immobilier.
 *
 * Réseau d'agences stephaneplazaimmobilier.com — OpenGraph confirmé natif
 * + HTML structuré. Pas de protection anti-bot (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "stephaneplazaimmobilier.com" || host.endsWith(".stephaneplazaimmobilier.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "Stéphane Plaza Immobilier" })
}

export const stephanePlazaParser: Parser = {
  name: "stephane-plaza",
  label: "Stéphane Plaza",
  hosts: ["stephaneplazaimmobilier.com"],
  matches,
  parse,
}
