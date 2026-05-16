/**
 * V97.38 P3-7 — Parser Guy Hoquet.
 *
 * Réseau d'agences guy-hoquet.com — HTML server-rendered + OG. Pas de
 * protection anti-bot (testé 2026-05-17).
 */

import type { Parser, ImportedAnnonce } from "../types"
import { parseAgencyHtml } from "../helpers-agency"

function matches(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return host === "guy-hoquet.com" || host.endsWith(".guy-hoquet.com")
  } catch {
    return false
  }
}

async function parse(html: string, _url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, { siteLabel: "Guy Hoquet" })
}

export const guyHoquetParser: Parser = {
  name: "guy-hoquet",
  label: "Guy Hoquet",
  hosts: ["guy-hoquet.com"],
  matches,
  parse,
}
