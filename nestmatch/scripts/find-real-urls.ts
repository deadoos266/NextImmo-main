/**
 * Trouve des URLs d'annonces réelles via wreq-js (qui passe Cloudflare).
 * Sert à alimenter les tests live avec des URLs en ligne et non inventées.
 */
import { fetch as wreqFetch } from "wreq-js"

interface Probe { name: string; listing: string; adUrlRegex: RegExp; base?: string }

const PROBES: Probe[] = [
  {
    name: "PAP",
    listing: "https://www.pap.fr/annonces/locations-paris-75",
    adUrlRegex: /href="(\/annonces\/[^"#?]+-r[0-9]+[^"]*)"/g,
    base: "https://www.pap.fr",
  },
  {
    name: "SeLoger",
    listing: "https://www.seloger.com/list.htm?projects=1&types=1&natures=1,2&places=[{ci:750056}]",
    adUrlRegex: /href="(https:\/\/www\.seloger\.com\/annonces\/locations\/[^"]+\.htm)"/g,
  },
  {
    name: "Logic-immo",
    listing: "https://www.logic-immo.com/locations-appartement-paris-75/",
    adUrlRegex: /href="(\/[^"]+detail-location-[^"]+\.htm)"/g,
    base: "https://www.logic-immo.com",
  },
]

async function find() {
  for (const p of PROBES) {
    console.log("═══ " + p.name + " ═══")
    try {
      const r: any = await wreqFetch(p.listing, { browser: "firefox_142", os: "windows" } as any)
      const body = await r.text()
      const found = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = p.adUrlRegex.exec(body)) && found.size < 5) {
        const url = m[1].startsWith("http") ? m[1] : (p.base || "") + m[1]
        found.add(url)
      }
      console.log("  listing status:", r.status, "size:", body.length)
      if (found.size === 0) {
        const hasDataDome = body.includes("DataDome") || body.includes("captcha-delivery")
        const hasCf = body.includes("Just a moment") || body.includes("cf-challenge")
        console.log("  no ad URLs · DataDome=" + hasDataDome + " · Cloudflare=" + hasCf)
        const titleM = body.match(/<title>(.*?)<\/title>/)
        if (titleM) console.log("  title:", titleM[1].slice(0, 80))
      } else {
        for (const u of found) console.log("  →", u)
      }
    } catch (e: any) {
      console.log("  FAIL:", e.message?.slice(0, 100))
    }
    console.log()
  }
}

find().catch(console.error)
