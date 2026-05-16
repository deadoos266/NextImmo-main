/**
 * V97.38 P3-7 — Registry des parsers d'import.
 *
 * L'ordre du tableau définit la priorité de matching : on prend le premier
 * parser qui répond `matches(url) === true`. Le `genericOgParser` est en
 * dernier (matche toujours, fallback).
 *
 * V97.38 (2026-05-17) : ajout de 12 parsers d'agences immobilières FR
 * sans protection anti-bot (Foncia, Orpi, iAD, Century 21, Guy Hoquet, ERA,
 * Laforêt, Nestenn, Stéphane Plaza, LocService, Studapart, ImmoJeune).
 */

import type { Parser } from "../types"
import { leboncoinParser } from "./leboncoin"
import { selogerParser } from "./seloger"
import { papParser } from "./pap"
import { bieniciParser } from "./bienici"
import { logicImmoParser } from "./logic-immo"
import { fonciaParser } from "./foncia"
import { orpiParser } from "./orpi"
import { iadParser } from "./iad"
import { century21Parser } from "./century21"
import { guyHoquetParser } from "./guy-hoquet"
import { eraParser } from "./era"
import { laforetParser } from "./laforet"
import { nestennParser } from "./nestenn"
import { stephanePlazaParser } from "./stephane-plaza"
import { locserviceParser } from "./locservice"
import { studapartParser } from "./studapart"
import { immojeuneParser } from "./immojeune"
import { genericOgParser } from "./generic-og"

export const PARSERS: Parser[] = [
  // Sites historiques (DataDome ou partiel)
  leboncoinParser,
  selogerParser,
  papParser,
  bieniciParser,
  logicImmoParser,
  // Agences FR sans protection anti-bot (V97.38)
  fonciaParser,
  orpiParser,
  iadParser,
  century21Parser,
  guyHoquetParser,
  eraParser,
  laforetParser,
  nestennParser,
  stephanePlazaParser,
  locserviceParser,
  studapartParser,
  immojeuneParser,
  // Fallback universel
  genericOgParser,
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
