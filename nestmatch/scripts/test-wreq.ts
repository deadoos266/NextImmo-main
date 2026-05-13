/**
 * V97.36 P3-7 bonus — Test wreq-js contre les sites anti-bot.
 *
 * Object : valider si wreq-js (TLS fingerprint impersonation Rust + napi)
 * bypass DataDome (Leboncoin) + Cloudflare (PAP) sans browser headless.
 *
 * Usage : npx tsx scripts/test-wreq.ts
 */

import { fetch as wreqFetch, getProfiles } from "wreq-js"

const TARGETS: Array<{ url: string; label: string }> = [
  { url: "https://www.leboncoin.fr/ad/locations/2900000000", label: "Leboncoin (DataDome)" },
  { url: "https://www.pap.fr/annonces/locations-paris-75-r1", label: "PAP (Cloudflare)" },
  { url: "https://www.seloger.com/", label: "SeLoger home (sanity check)" },
  { url: "https://www.bienici.com/", label: "Bien'ici home (sanity check)" },
  { url: "https://fr.wikipedia.org/wiki/Immobilier", label: "Wikipedia (control)" },
]

const BROWSERS = ["chrome_142", "firefox_142", "safari_18"] as const

async function test() {
  console.log("Profiles disponibles :", getProfiles?.()?.slice?.(0, 10) || "n/a")
  console.log()

  for (const target of TARGETS) {
    console.log("─".repeat(80))
    console.log(`TARGET : ${target.label}`)
    console.log(`URL    : ${target.url}`)
    for (const browser of BROWSERS) {
      const t0 = Date.now()
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await wreqFetch(target.url, { browser, os: "windows" } as any)
        const body = await res.text()
        const dt = Date.now() - t0
        const hasDataDome = body.includes("DataDome") || body.includes("datadome") || body.includes("captcha-delivery")
        const hasCloudflare = body.includes("Just a moment") || body.includes("cf-challenge") || body.includes("cf-mitigated")
        const titleM = body.match(/<title>(.*?)<\/title>/)
        console.log(`  ${browser.padEnd(14)} → ${String(res.status).padStart(3)} · ${String(body.length).padStart(7)}o · ${dt}ms · DD=${hasDataDome ? "✗" : "·"} CF=${hasCloudflare ? "✗" : "·"} · ${titleM ? titleM[1].slice(0, 60) : "(no title)"}`)
      } catch (e: unknown) {
        console.log(`  ${browser.padEnd(14)} → FAIL : ${(e as Error).message?.slice(0, 100)}`)
      }
    }
    console.log()
  }
}

test().catch(e => { console.error(e); process.exit(1) })
