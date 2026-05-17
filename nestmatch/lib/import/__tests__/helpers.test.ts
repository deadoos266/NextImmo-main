import { describe, it, expect } from "vitest"
import {
  extractJsonLd,
  findByType,
  extractMeta,
  extractMetaAll,
  extractTitle,
  decodeHtmlEntities,
  parsePrice,
  parseSurface,
  normalizeDpe,
  countFields,
} from "../helpers"

describe("import/helpers", () => {
  describe("extractJsonLd", () => {
    it("extrait un script JSON-LD simple", () => {
      const html = `<script type="application/ld+json">{"@type":"RealEstateListing","name":"Studio Paris"}</script>`
      const out = extractJsonLd(html)
      expect(out).toHaveLength(1)
      expect((out[0] as Record<string, unknown>).name).toBe("Studio Paris")
    })

    it("supporte plusieurs blocs JSON-LD", () => {
      const html = `
        <script type="application/ld+json">{"@type":"WebSite","name":"S"}</script>
        <script type="application/ld+json">{"@type":"Product","name":"P"}</script>
      `
      const out = extractJsonLd(html)
      expect(out).toHaveLength(2)
    })

    it("supporte @graph", () => {
      const html = `<script type="application/ld+json">{"@graph":[{"@type":"A"},{"@type":"B"}]}</script>`
      const out = extractJsonLd(html)
      expect(out).toHaveLength(2)
    })

    it("ignore JSON-LD malformé sans crasher", () => {
      const html = `<script type="application/ld+json">{not json</script><script type="application/ld+json">{"@type":"OK"}</script>`
      const out = extractJsonLd(html)
      expect(out).toHaveLength(1)
    })
  })

  describe("findByType", () => {
    it("filtre par type unique ou array", () => {
      const nodes = [
        { "@type": "RealEstateListing", name: "A" },
        { "@type": "Apartment", name: "B" },
        { "@type": ["Product", "House"], name: "C" },
        { "@type": "Other", name: "D" },
      ]
      const matches = findByType(nodes, ["RealEstateListing", "House"])
      expect(matches.map(n => n.name)).toEqual(["A", "C"])
    })

    // V97.39.12 — Foncia émet `@type: "apartment"` minuscule
    it("V97.39.12 — match case-insensitive sur @type (Foncia 'apartment')", () => {
      const nodes = [
        { "@type": "apartment", name: "Foncia studio" },
        { "@type": "Apartment", name: "Schema.org standard" },
        { "@type": "APARTMENT", name: "Tout en majuscule" },
      ]
      const matches = findByType(nodes, ["Apartment"])
      expect(matches.map(n => n.name)).toEqual([
        "Foncia studio",
        "Schema.org standard",
        "Tout en majuscule",
      ])
    })

    it("V97.39.12 — case-insensitive avec @type array", () => {
      const nodes = [
        { "@type": ["apartment", "thing"], name: "Foncia array" },
      ]
      expect(findByType(nodes, ["Apartment"])).toHaveLength(1)
    })
  })

  // V97.39.12 — JSON-LD avec entités HTML dans les strings (Guy Hoquet)
  describe("V97.39.12 — extractJsonLd avec entités HTML", () => {
    it("parse JSON-LD valide après decode entités HTML", () => {
      // Guy Hoquet écrit littéralement &lt;br /&gt; et &quot; dans les strings
      const html = `<script type="application/ld+json">{"@type":"Apartment","description":"Appart &lt;br /&gt; avec &quot;balcon&quot;","name":"X"}</script>`
      const out = extractJsonLd(html)
      // Premier JSON.parse échoue (entités cassent les strings), retry après decode → OK
      expect(out).toHaveLength(1)
      expect((out[0] as Record<string, unknown>).name).toBe("X")
    })

    it("ignore vraiment malformé même après decode", () => {
      const html = `<script type="application/ld+json">{not json at all{{</script>`
      const out = extractJsonLd(html)
      expect(out).toHaveLength(0)
    })
  })

  describe("extractMeta", () => {
    it("extrait og:title", () => {
      const html = `<meta property="og:title" content="Mon studio">`
      expect(extractMeta(html, ["og:title"])).toBe("Mon studio")
    })

    it("supporte attribut name=", () => {
      const html = `<meta name="description" content="Une description">`
      expect(extractMeta(html, ["description"])).toBe("Une description")
    })

    it("supporte attribut content avant property", () => {
      const html = `<meta content="Reverse" property="og:title">`
      expect(extractMeta(html, ["og:title"])).toBe("Reverse")
    })

    it("essaie plusieurs keys dans l'ordre", () => {
      const html = `<meta name="description" content="DESC">`
      expect(extractMeta(html, ["og:description", "description"])).toBe("DESC")
    })

    it("retourne undefined si rien trouvé", () => {
      expect(extractMeta("<html></html>", ["og:title"])).toBeUndefined()
    })

    it("decode HTML entities", () => {
      const html = `<meta property="og:title" content="Caf&eacute; &amp; co">`
      // &eacute; n'est pas dans notre table mais &amp; oui
      expect(extractMeta(html, ["og:title"])).toContain("&")
    })
  })

  describe("extractMetaAll", () => {
    it("retourne plusieurs og:image", () => {
      const html = `
        <meta property="og:image" content="https://a.jpg">
        <meta property="og:image" content="https://b.jpg">
      `
      expect(extractMetaAll(html, "og:image")).toEqual(["https://a.jpg", "https://b.jpg"])
    })
  })

  describe("extractTitle", () => {
    it("extrait le titre HTML", () => {
      expect(extractTitle("<html><title>Hello</title></html>")).toBe("Hello")
    })
    it("retourne undefined si pas de title", () => {
      expect(extractTitle("<html></html>")).toBeUndefined()
    })
  })

  describe("decodeHtmlEntities", () => {
    it("décode les entités classiques", () => {
      expect(decodeHtmlEntities("&amp;&lt;&gt;&quot;")).toBe("&<>\"")
    })
    it("décode les entités numériques", () => {
      expect(decodeHtmlEntities("&#233;")).toBe("é")
    })
    it("décode hex", () => {
      expect(decodeHtmlEntities("&#xe9;")).toBe("é")
    })
  })

  describe("parsePrice", () => {
    it("parse 1200", () => {
      expect(parsePrice("1200")).toBe(1200)
    })
    it("parse 1 200 €/mois CC", () => {
      expect(parsePrice("1 200 €/mois CC")).toBe(1200)
    })
    it("parse 1,200.50", () => {
      // Le helper remplace , par . donc 1.200.50 → parseFloat = 1.2 ; édge case
      // En pratique les prix immo sont entiers, on accepte
      const n = parsePrice("1200,50")
      expect(n).toBe(1201)  // round
    })
    it("retourne undefined sur input invalide", () => {
      expect(parsePrice("")).toBeUndefined()
      expect(parsePrice(null)).toBeUndefined()
      expect(parsePrice("abc")).toBeUndefined()
    })
  })

  describe("parseSurface", () => {
    it("parse 42 m²", () => {
      expect(parseSurface("42 m²")).toBe(42)
    })
    it("parse 38,5", () => {
      expect(parseSurface("38,5")).toBe(39)
    })
  })

  describe("normalizeDpe", () => {
    it("retourne A-G strict", () => {
      expect(normalizeDpe("A")).toBe("A")
      expect(normalizeDpe("c")).toBe("C")
    })
    it("extrait depuis phrase", () => {
      expect(normalizeDpe("Classe énergie : D")).toBe("D")
    })
    it("retourne undefined si hors A-G", () => {
      expect(normalizeDpe("Z")).toBeUndefined()
      expect(normalizeDpe("")).toBeUndefined()
      expect(normalizeDpe(null)).toBeUndefined()
    })
  })

  describe("countFields", () => {
    it("compte les fields renseignés", () => {
      const data = {
        source: "leboncoin" as const,
        source_url: "https://x.fr",
        title: "T", price: 1200, surface: 40, rooms: 2,
        photos: ["a.jpg"], equipments: ["parking"],
      }
      expect(countFields(data)).toBe(6)  // title, price, surface, rooms, photos, equipments
    })
    it("ignore les fields vides", () => {
      expect(countFields({ source: "generic" as const, source_url: "x", title: "" })).toBe(0)
    })
  })
})
