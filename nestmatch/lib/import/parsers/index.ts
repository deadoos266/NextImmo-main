/**
 * V97.36 P3-7 — Registry des parsers d'import.
 *
 * L'ordre du tableau définit la priorité de matching : on prend le premier
 * parser qui répond `matches(url) === true`. Le `genericOgParser` est en
 * dernier (matche toujours, fallback).
 */

import type { Parser } from "../types"
import { leboncoinParser } from "./leboncoin"
import { selogerParser } from "./seloger"
import { papParser } from "./pap"
import { bieniciParser } from "./bienici"
import { logicImmoParser } from "./logic-immo"
import { genericOgParser } from "./generic-og"

export const PARSERS: Parser[] = [
  leboncoinParser,
  selogerParser,
  papParser,
  bieniciParser,
  logicImmoParser,
  genericOgParser,  // toujours dernier
]

export function findParser(url: string): Parser | null {
  for (const p of PARSERS) {
    try {
      if (p.matches(url)) return p
    } catch { /* parser broken on this URL, skip */ }
  }
  return null
}

export const SUPPORTED_SITES = PARSERS.filter(p => p.name !== "generic").map(p => ({
  name: p.name,
  label: p.label,
  hosts: p.hosts,
}))
