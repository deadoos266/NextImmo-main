/**
 * V97.38 P3-7 — Parser Laforêt Immobilier.
 *
 * Réseau d'agences laforet.com — HTML semantic + prices visibles. Pas de
 * protection anti-bot (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "laforet.com" || host.endsWith(".laforet.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "Laforêt" })
}

export const laforetParser: Parser = {
  name: "laforet",
  label: "Laforêt",
  hosts: ["laforet.com"],
  matches,
  parse,
}
