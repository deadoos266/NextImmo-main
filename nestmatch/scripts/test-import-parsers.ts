/**
 * V97.36 P3-7 — Test live des parsers d'import.
 *
 * Usage :
 *   cd nestmatch
 *   node --experimental-strip-types scripts/test-import-parsers.ts
 *
 * Pour chaque URL :
 *  - HTTP status (avec UA KeyMatch + redirect manual)
 *  - Détection anti-bot (DataDome / Cloudflare challenge)
 *  - Résultat du parser : title, prix, surface, photos, warnings
 *  - Champs extraits / champs total
 */

// Imports explicites avec extension .ts pour compat Node ESM transform-types
import { findParser } from "../lib/import/parsers/index"
import { fetchUrl, ImportFetchError } from "../lib/import/fetcher"
import { countFields, FIELDS_TOTAL } from "../lib/import/helpers"
import type { ImportedAnnonce, ImportSource } from "../lib/import/types"

class ImportError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = "ImportError"
  }
}

async function importFromUrl(url: string) {
  const t0 = Date.now()
  const parser = findParser(url)
  if (!parser) throw new ImportError("NO_PARSER", "Aucun parser ne peut traiter cette URL")
  let html: string, finalUrl: string
  try {
    const fetched = await fetchUrl(url)
    html = fetched.html
    finalUrl = fetched.final_url
  } catch (e) {
    if (e instanceof ImportFetchError) throw new ImportError(e.code, e.message)
    throw new ImportError("FETCH_ERROR", (e as Error).message)
  }
  let parsed: Partial<ImportedAnnonce>
  try { parsed = await parser.parse(html, finalUrl) }
  catch (e) { throw new ImportError("PARSE_ERROR", (e as Error).message) }
  const data: ImportedAnnonce = { source: parser.name, source_url: finalUrl, ...parsed }
  return { data, fields_extracted: countFields(data), fields_total: FIELDS_TOTAL, duration_ms: Date.now() - t0 }
}

const TEST_URLS: Array<{ url: string; expected_source: ImportSource; note: string }> = [
  // PAP — vraies URLs en ligne récupérées via wreq depuis la page liste Paris
  // (re-test V97.37 : wreq-js Firefox 142 doit bypasser le Cloudflare PAP)
  { url: "https://www.pap.fr/annonces/appartement-paris-13e-r421901054", expected_source: "pap", note: "PAP appart Paris 13e (URL réelle)" },
  { url: "https://www.pap.fr/annonces/appartement-paris-14e-75014-r454700471", expected_source: "pap", note: "PAP appart Paris 14e (URL réelle)" },

  // V97.38 — 12 nouveaux parsers d'agences FR (sanity check homepage, à remplacer par URLs annonces réelles via find-real-urls.ts)
  { url: "https://fr.foncia.com/", expected_source: "foncia", note: "Foncia home (sanity)" },
  { url: "https://www.orpi.com/", expected_source: "orpi", note: "Orpi home (sanity)" },
  { url: "https://www.iadfrance.fr/", expected_source: "iad", note: "iAD France home (sanity)" },
  { url: "https://www.century21.fr/", expected_source: "century21", note: "Century 21 home (sanity)" },
  { url: "https://www.guy-hoquet.com/", expected_source: "guy-hoquet", note: "Guy Hoquet home (sanity)" },
  { url: "https://www.eraimmobilier.com/", expected_source: "era", note: "ERA Immobilier home (sanity)" },
  { url: "https://www.laforet.com/", expected_source: "laforet", note: "Laforêt home (sanity)" },
  { url: "https://www.nestenn.com/", expected_source: "nestenn", note: "Nestenn home (sanity)" },
  { url: "https://www.stephaneplazaimmobilier.com/", expected_source: "stephane-plaza", note: "Stéphane Plaza home (sanity)" },
  { url: "https://www.locservice.fr/", expected_source: "locservice", note: "LocService home (sanity)" },
  { url: "https://www.studapart.com/fr", expected_source: "studapart", note: "Studapart home (sanity)" },
  { url: "https://www.immojeune.com/", expected_source: "immojeune", note: "ImmoJeune home (sanity)" },

  // Leboncoin — toujours bloqué attendu (DataDome JS challenge) — bypass V97.39 via worker Zendriver
  { url: "https://www.leboncoin.fr/ad/locations/2900000000", expected_source: "leboncoin", note: "Leboncoin → DataDome (attendu BOT_PROTECTION)" },

  // SeLoger + Logic-immo + Bien'ici — sanity check
  { url: "https://www.seloger.com/", expected_source: "seloger", note: "SeLoger home" },
  { url: "https://www.logic-immo.com/", expected_source: "logic-immo", note: "Logic-immo home" },
  { url: "https://www.bienici.com/", expected_source: "bienici", note: "Bien'ici home (SPA)" },

  // Sites publics OG (fallback générique)
  { url: "https://fr.wikipedia.org/wiki/Immobilier", expected_source: "generic", note: "Wikipedia : test fallback OG" },
]

function trunc(s: string | undefined, n: number): string {
  if (!s) return ""
  return s.length > n ? s.slice(0, n) + "…" : s
}

async function test(item: typeof TEST_URLS[0]) {
  console.log("\n══════════════════════════════════════════════════════════════════════════════")
  console.log(`▸ ${item.note}`)
  console.log(`  ${item.url}`)
  console.log("──────────────────────────────────────────────────────────────────────────────")

  try {
    const result = await importFromUrl(item.url)
    console.log(`✓ source détectée : ${result.data.source} (attendu ${item.expected_source})`)
    console.log(`  fields extraits : ${result.fields_extracted}/${result.fields_total}`)
    console.log(`  duration : ${result.duration_ms} ms`)
    console.log()
    console.log(`  title       : ${trunc(result.data.title, 70)}`)
    console.log(`  description : ${trunc(result.data.description, 70)}`)
    console.log(`  price       : ${result.data.price ?? "—"} €`)
    console.log(`  surface     : ${result.data.surface ?? "—"} m²`)
    console.log(`  rooms       : ${result.data.rooms ?? "—"}`)
    console.log(`  city        : ${result.data.city ?? "—"}`)
    console.log(`  postal_code : ${result.data.postal_code ?? "—"}`)
    console.log(`  dpe         : ${result.data.dpe ?? "—"}`)
    console.log(`  photos      : ${result.data.photos?.length ?? 0}`)
    if (result.data.photos && result.data.photos.length > 0) {
      console.log(`    → ${result.data.photos[0]}`)
    }
    console.log(`  equipments  : ${result.data.equipments?.join(", ") || "—"}`)
    if (result.data.warnings && result.data.warnings.length > 0) {
      console.log(`  warnings :`)
      for (const w of result.data.warnings) console.log(`    ⚠ ${w}`)
    }
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    console.log(`✗ ÉCHEC`)
    console.log(`  code : ${err.code || "?"}`)
    console.log(`  message : ${err.message || String(e)}`)
  }
}

async function main() {
  console.log("═══ Test live des parsers KeyMatch P3-7 ═══")
  console.log(`Date : ${new Date().toISOString()}`)
  console.log(`Node : ${process.version}`)
  for (const t of TEST_URLS) {
    await test(t)
  }
  console.log("\n══════════════════════════════════════════════════════════════════════════════")
  console.log("FIN")
}

main().catch(e => { console.error(e); process.exit(1) })
