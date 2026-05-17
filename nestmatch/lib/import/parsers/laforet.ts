/**
 * V97.38 P3-7 — Parser Laforêt Immobilier.
 *
 * Réseau d'agences laforet.com — HTML semantic + prices visibles. Pas de
 * protection anti-bot (testé 2026-05-17).
 *
 * V97.39.15 — Custom hook : Laforêt n'expose pas le code postal dans og:title
 * mais dans l'URL slug (`/louer/paris-20/...` → ville=Paris, arrondissement 20).
 * Tente d'extraire l'arrondissement → CP Paris/Lyon/Marseille.
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

async function parse(html: string, url: string): Promise<Partial<ImportedAnnonce>> {
  return parseAgencyHtml(html, {
    siteLabel: "Laforêt",
    custom: (_htmlBody, out) => {
      // V97.39.15 — extract CP depuis URL slug
      // Format Laforêt : /agence-immobiliere/<agence>/louer/<ville-arrondissement>/...
      // Ex: /louer/paris-20/appartement... → ville=paris, arrondissement=20 → CP=75020
      if (!out.postal_code) {
        try {
          const path = new URL(url).pathname.toLowerCase()
          // Paris : paris-NN → 75NNN (NN sur 2 chiffres)
          const parisMatch = /\/paris-(\d{1,2})\b/.exec(path)
          if (parisMatch) {
            const arr = parseInt(parisMatch[1], 10)
            if (arr >= 1 && arr <= 20) {
              out.postal_code = `75${String(arr).padStart(3, "0")}`
              if (!out.city) out.city = "Paris"
            }
          } else {
            // Lyon : lyon-NN → 690NN
            const lyonMatch = /\/lyon-(\d)\b/.exec(path)
            if (lyonMatch) {
              const arr = parseInt(lyonMatch[1], 10)
              if (arr >= 1 && arr <= 9) {
                out.postal_code = `6900${arr}`
                if (!out.city) out.city = "Lyon"
              }
            } else {
              // Marseille : marseille-NN → 130NN
              const marseilleMatch = /\/marseille-(\d{1,2})\b/.exec(path)
              if (marseilleMatch) {
                const arr = parseInt(marseilleMatch[1], 10)
                if (arr >= 1 && arr <= 16) {
                  out.postal_code = `130${String(arr).padStart(2, "0")}`
                  if (!out.city) out.city = "Marseille"
                }
              }
            }
          }
        } catch {
          // URL invalide, skip
        }
      }
    },
  })
}

export const laforetParser: Parser = {
  name: "laforet",
  label: "Laforêt",
  hosts: ["laforet.com"],
  matches,
  parse,
}
