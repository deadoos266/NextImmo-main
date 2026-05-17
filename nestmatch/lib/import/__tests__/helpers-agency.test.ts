/**
 * V97.39.12 — Tests parseAgencyHtml() après audit live des 12 parsers.
 *
 * Couvre les patterns critiques :
 *  - JSON-LD case-insensitive (Foncia "apartment")
 *  - JSON-LD avec entités HTML (Guy Hoquet)
 *  - og:image_N multi-photos (Laforêt)
 *  - regex surface strict anti false-match dimensions image (ImmoJeune)
 *  - CreativeWorkSeries accepté (ImmoJeune résidence)
 */

import { describe, it, expect } from "vitest"
import { parseAgencyHtml } from "../helpers-agency"

describe("parseAgencyHtml — fixes V97.39.12", () => {
  it("Foncia : JSON-LD @type:apartment minuscule extrait correctement", async () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "apartment",
          "name": "Studio Paris 15",
          "offers": { "@type": "Offer", "price": 1200 },
          "floorSize": { "@type": "QuantitativeValue", "value": 35 },
          "numberOfRooms": 1,
          "address": { "addressLocality": "Paris", "postalCode": "75015" },
          "image": ["https://example.com/photo1.jpg"]
        }
        </script>
      </head><body></body></html>
    `
    const out = await parseAgencyHtml(html, { siteLabel: "Foncia" })
    expect(out.title).toBe("Studio Paris 15")
    expect(out.price).toBe(1200)
    expect(out.surface).toBe(35)
    expect(out.rooms).toBe(1)
    expect(out.city).toBe("Paris")
    expect(out.postal_code).toBe("75015")
    expect(out.photos).toEqual(["https://example.com/photo1.jpg"])
  })

  it("Guy Hoquet : JSON-LD avec entités HTML dans strings (description avec &lt;br /&gt;)", async () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {
          "@type": "Apartment",
          "name": "T2 Grenoble",
          "description": "Appart &lt;br /&gt; avec &quot;balcon&quot;",
          "offers": { "price": 705 },
          "numberOfRooms": 2
        }
        </script>
      </head><body></body></html>
    `
    const out = await parseAgencyHtml(html, { siteLabel: "Guy Hoquet" })
    // Le JSON-LD a été parsé après decode des entités → tous les champs OK
    expect(out.title).toBe("T2 Grenoble")
    expect(out.price).toBe(705)
    expect(out.rooms).toBe(2)
    expect(out.description).toContain("balcon")
  })

  it("Laforêt : og:image_0..og:image_11 collectés en plus de og:image principal", async () => {
    const ogImages = Array.from({ length: 12 }, (_, i) =>
      `<meta property="og:image_${i}" content="https://example.com/photo${i}.jpg">`,
    ).join("\n")
    const html = `
      <html><head>
        <meta property="og:title" content="Loc T3 Marseille">
        <meta property="og:image" content="https://example.com/main.jpg">
        ${ogImages}
      </head><body></body></html>
    `
    const out = await parseAgencyHtml(html, { siteLabel: "Laforêt" })
    expect(out.photos).toBeDefined()
    expect(out.photos!.length).toBe(12)
    expect(out.photos![0]).toBe("https://example.com/main.jpg")
    expect(out.photos!).toContain("https://example.com/photo0.jpg")
    expect(out.photos!).toContain("https://example.com/photo10.jpg")
  })

  it("Surface : pas de false-match sur dimensions image (1200 m² impossible)", async () => {
    // ImmoJeune avait `width="1200"` puis `image: { width: 1200, height: 800 }`
    // et plus loin un `1200 m²` dans le HTML attribut → la regex match 1200 m² alors qu'on parle d'une image
    const html = `
      <html><head>
        <meta property="og:title" content="Résidence Ivry">
      </head><body>
        <img width="1200" height="800" src="x.jpg" alt="">
        <div>Surface : 25 m²</div>
        <p>Photo 1200 m² zoom</p>
      </body></html>
    `
    const out = await parseAgencyHtml(html, { siteLabel: "ImmoJeune" })
    // La regex stricte avec lookbehind whitespace doit trouver "25 m²", pas "1200 m²"
    expect(out.surface).toBe(25)
  })

  it("Surface : reject valeurs irréalistes > 1000 m²", async () => {
    const html = `<html><body>Surface 5000 m²</body></html>`
    const out = await parseAgencyHtml(html, { siteLabel: "test" })
    expect(out.surface).toBeUndefined()
  })

  it("Surface : reject valeurs < 5 m²", async () => {
    const html = `<html><body>Surface 2 m²</body></html>`
    const out = await parseAgencyHtml(html, { siteLabel: "test" })
    expect(out.surface).toBeUndefined()
  })

  // V97.39.13 — retry sur tous les matches si le 1er est rejeté par sanity
  it("V97.39.13 — Surface : retry après sanity reject (1500 m² rejeté → 45 m² gardé)", async () => {
    const html = `
      <html><body>
        <div>Vue panoramique 1500 m² de jardin</div>
        <div>Surface logement : 45 m²</div>
      </body></html>
    `
    const out = await parseAgencyHtml(html, { siteLabel: "test" })
    expect(out.surface).toBe(45)
  })

  it("V97.39.13 — Surface : retry skip < 5 m² jusqu'à valeur valide", async () => {
    const html = `<html><body>RDC 2 m² placard, app 50 m² total</body></html>`
    const out = await parseAgencyHtml(html, { siteLabel: "test" })
    expect(out.surface).toBe(50)
  })

  it("ImmoJeune : CreativeWorkSeries accepté comme type valide", async () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {
          "@type": "CreativeWorkSeries",
          "name": "Résidence Sharies Ivry",
          "offers": { "price": 960 }
        }
        </script>
      </head><body></body></html>
    `
    const out = await parseAgencyHtml(html, { siteLabel: "ImmoJeune" })
    expect(out.title).toBe("Résidence Sharies Ivry")
    expect(out.price).toBe(960)
  })

  it("Fallback OG quand JSON-LD absent (Orpi, Century 21)", async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Location appartement, 44.29 m² T-2 à Strasbourg, 926 €">
        <meta property="og:image" content="https://example.com/photo.jpg">
      </head><body></body></html>
    `
    const out = await parseAgencyHtml(html, { siteLabel: "Orpi" })
    expect(out.title).toContain("Strasbourg")
    expect(out.photos).toEqual(["https://example.com/photo.jpg"])
    // Note : surface/prix via regex heuristique sur le body, pas garantis ici
  })

  it("Warnings toujours présents (avis user)", async () => {
    const html = `<html><body></body></html>`
    const out = await parseAgencyHtml(html, { siteLabel: "TestSite" })
    expect(out.warnings).toBeDefined()
    expect(out.warnings!.length).toBeGreaterThanOrEqual(1)
    expect(out.warnings![0]).toContain("TestSite")
  })
})

// V97.39.14 — Tests des custom hooks par parser
describe("Custom hooks parsers V97.39.14", () => {
  it("Orpi custom hook : extrait pièces depuis og:title 'T-2'", async () => {
    const { orpiParser } = await import("../parsers/orpi")
    const html = `
      <html><head>
        <meta property="og:title" content="Location appartement, 44.29 m² T-2 à Strasbourg, 926 € | Orpi">
      </head><body>44.29 m²</body></html>
    `
    const out = await orpiParser.parse(html, "https://www.orpi.com/annonce/xxx")
    expect(out.rooms).toBe(2)
  })

  it("Orpi custom hook : 'T3' sans tiret marche aussi", async () => {
    const { orpiParser } = await import("../parsers/orpi")
    const html = `
      <html><head>
        <meta property="og:title" content="Location appartement T3 80 m² Lyon">
      </head><body>80 m²</body></html>
    `
    const out = await orpiParser.parse(html, "https://www.orpi.com/annonce/yyy")
    expect(out.rooms).toBe(3)
  })

  it("Century 21 custom hook : extrait code postal + ville depuis og:title", async () => {
    const { century21Parser } = await import("../parsers/century21")
    const html = `
      <html><head>
        <meta property="og:title" content="Appartement F2 à louer - 2 pièces - 42 m2 - Paris - 75012 - ILE-DE-FRANCE">
      </head><body>42 m²</body></html>
    `
    const out = await century21Parser.parse(html, "https://www.century21.fr/x/")
    expect(out.postal_code).toBe("75012")
    expect(out.city).toBe("Paris")
  })

  it("Foncia custom hook : extrait DPE depuis data-dpe-letter", async () => {
    const { fonciaParser } = await import("../parsers/foncia")
    const html = `
      <html><body>
        <div class="property">Appart à Paris</div>
        <span data-dpe-letter="C">classement énergétique</span>
      </body></html>
    `
    const out = await fonciaParser.parse(html, "https://fr.foncia.com/x.htm")
    expect(out.dpe).toBe("C")
  })

  it("Foncia custom hook : extrait DPE depuis class='dpe-grade-D'", async () => {
    const { fonciaParser } = await import("../parsers/foncia")
    const html = `
      <html><body>
        <div class="dpe-grade-D">D</div>
      </body></html>
    `
    const out = await fonciaParser.parse(html, "https://fr.foncia.com/x.htm")
    expect(out.dpe).toBe("D")
  })

  it("Foncia : DPE déjà extrait par helper ne se fait pas écraser", async () => {
    const { fonciaParser } = await import("../parsers/foncia")
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"@type":"apartment","name":"X","description":"classe énergétique : A"}
        </script>
      </head><body>
        <span data-dpe-letter="G">G</span>
      </body></html>
    `
    const out = await fonciaParser.parse(html, "https://fr.foncia.com/x.htm")
    // Le helper a déjà mis A via regex sur description → custom hook ne touche pas
    expect(out.dpe).toBe("A")
  })
})

// V97.39.15 — Tests des fixes post second test live
describe("Custom hooks V97.39.15", () => {
  it("Century 21 : extrait pièces depuis format français 'F2'", async () => {
    const { century21Parser } = await import("../parsers/century21")
    const html = `
      <html><head>
        <meta property="og:title" content="Appartement F2 à louer - 42 m2 - Paris - 75013">
      </head><body>42 m²</body></html>
    `
    const out = await century21Parser.parse(html, "https://www.century21.fr/x/")
    expect(out.rooms).toBe(2)
  })

  it("Century 21 : F3 sans espace marche aussi", async () => {
    const { century21Parser } = await import("../parsers/century21")
    const html = `
      <html><head>
        <meta property="og:title" content="F3 à louer Bordeaux 33000">
      </head><body></body></html>
    `
    const out = await century21Parser.parse(html, "https://www.century21.fr/x/")
    expect(out.rooms).toBe(3)
  })

  it("Orpi : extrait codePostal depuis window.dataLayer", async () => {
    const { orpiParser } = await import("../parsers/orpi")
    const html = `
      <html><head>
        <meta property="og:title" content="Location T-3 71.8 m² Strasbourg">
      </head><body>
        <script>window.dataLayer = [{"event":"pageview","codePostal":"67000","nbChambres":"2"}];</script>
      </body></html>
    `
    const out = await orpiParser.parse(html, "https://www.orpi.com/annonce/x")
    expect(out.postal_code).toBe("67000")
    expect(out.bedrooms).toBe(2)
  })

  it("Orpi : rejette CP qui ressemble à une année", async () => {
    const { orpiParser } = await import("../parsers/orpi")
    const html = `
      <html><body>
        <script>window.dataLayer = [{"codePostal":"2024"}];</script>
      </body></html>
    `
    const out = await orpiParser.parse(html, "https://www.orpi.com/annonce/x")
    expect(out.postal_code).toBeUndefined()
  })

  it("Laforêt : extrait CP depuis URL slug paris-20", async () => {
    const { laforetParser } = await import("../parsers/laforet")
    const html = `<html><head><meta property="og:title" content="Loc 1P Paris"></head><body></body></html>`
    const out = await laforetParser.parse(
      html,
      "https://www.laforet.com/agence-immobiliere/herblay/louer/paris-20/appartement-1-piece-52690323",
    )
    expect(out.postal_code).toBe("75020")
    expect(out.city).toBe("Paris")
  })

  it("Laforêt : CP arrondissement Paris 1er", async () => {
    const { laforetParser } = await import("../parsers/laforet")
    const html = `<html><body></body></html>`
    const out = await laforetParser.parse(
      html,
      "https://www.laforet.com/agence-immobiliere/x/louer/paris-1/appartement-...",
    )
    expect(out.postal_code).toBe("75001")
    expect(out.city).toBe("Paris")
  })

  it("Laforêt : CP Lyon 7e", async () => {
    const { laforetParser } = await import("../parsers/laforet")
    const html = `<html><body></body></html>`
    const out = await laforetParser.parse(
      html,
      "https://www.laforet.com/agence-immobiliere/x/louer/lyon-7/appartement-...",
    )
    expect(out.postal_code).toBe("69007")
    expect(out.city).toBe("Lyon")
  })

  it("Laforêt : CP Marseille 13e", async () => {
    const { laforetParser } = await import("../parsers/laforet")
    const html = `<html><body></body></html>`
    const out = await laforetParser.parse(
      html,
      "https://www.laforet.com/agence-immobiliere/x/louer/marseille-13/appartement-...",
    )
    expect(out.postal_code).toBe("13013")
    expect(out.city).toBe("Marseille")
  })

  it("Laforêt : ne touche pas postal_code si déjà set par helper", async () => {
    const { laforetParser } = await import("../parsers/laforet")
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"@type":"Apartment","address":{"postalCode":"75001"}}
        </script>
      </head><body></body></html>
    `
    const out = await laforetParser.parse(
      html,
      "https://www.laforet.com/agence-immobiliere/x/louer/paris-20/x",
    )
    // Helper a déjà mis 75001 via JSON-LD → custom hook ne touche pas
    expect(out.postal_code).toBe("75001")
  })
})

// V97.39.17 — Tests importFromHtml (bookmarklet bypass DataDome)
describe("importFromHtml — V97.39.17 bookmarklet client-side", () => {
  it("parse un HTML SeLoger fictif avec JSON-LD complet", async () => {
    const { importFromHtml } = await import("../index")
    const html = `
      <html><head>
        <script type="application/ld+json">
        {
          "@type":"Apartment",
          "name":"Studio 25 m² Paris 11e",
          "offers":{"price":1100},
          "floorSize":{"value":25},
          "numberOfRooms":1,
          "address":{"addressLocality":"Paris","postalCode":"75011"}
        }
        </script>
      </head><body></body></html>
    `
    const result = await importFromHtml(
      "https://www.seloger.com/annonces/locations/appartement/paris-11e/123456789.htm",
      html,
    )
    expect(result.data.title).toBe("Studio 25 m² Paris 11e")
    expect(result.data.price).toBe(1100)
    expect(result.data.surface).toBe(25)
    expect(result.data.city).toBe("Paris")
    expect(result.data.postal_code).toBe("75011")
    expect(result.fetcher_used).toBe("bookmarklet")
    // Note : le parser SeLoger spécifique se charge — son matches() teste l'URL
  })

  it("rejette HTML trop court (< 200 chars)", async () => {
    const { importFromHtml, ImportError } = await import("../index")
    await expect(importFromHtml("https://www.seloger.com/", "<html>vide</html>"))
      .rejects.toThrow(ImportError)
    try {
      await importFromHtml("https://www.seloger.com/", "<html>vide</html>")
    } catch (e) {
      expect(e).toHaveProperty("code", "HTML_TOO_SHORT")
    }
  })

  it("rejette HTML > 5 MB", async () => {
    const { importFromHtml, ImportError } = await import("../index")
    const hugeHtml = "<html>" + "x".repeat(5 * 1024 * 1024 + 10) + "</html>"
    await expect(importFromHtml("https://www.seloger.com/", hugeHtml))
      .rejects.toThrow(ImportError)
    try {
      await importFromHtml("https://www.seloger.com/", hugeHtml)
    } catch (e) {
      expect(e).toHaveProperty("code", "HTML_TOO_LARGE")
    }
  })

  it("renvoie fetcher_used = 'bookmarklet' (pour tracing admin/imports)", async () => {
    const { importFromHtml } = await import("../index")
    const html = `<html><body>${"<p>filler content for KeyMatch import test </p>".repeat(20)}</body></html>`
    const result = await importFromHtml("https://www.foncia.com/", html)
    expect(result.fetcher_used).toBe("bookmarklet")
  })
})
