import { describe, it, expect } from "vitest"
import { leboncoinParser } from "../parsers/leboncoin"
import { selogerParser } from "../parsers/seloger"
import { papParser } from "../parsers/pap"
import { bieniciParser } from "../parsers/bienici"
import { logicImmoParser } from "../parsers/logic-immo"
import { genericOgParser } from "../parsers/generic-og"
import { findParser } from "../parsers"

describe("import/parsers", () => {
  describe("matches", () => {
    it("Leboncoin reconnaît les URLs locations", () => {
      expect(leboncoinParser.matches("https://www.leboncoin.fr/ad/locations/12345")).toBe(true)
      expect(leboncoinParser.matches("https://www.leboncoin.fr/locations/12345")).toBe(true)
      expect(leboncoinParser.matches("https://leboncoin.fr/ad/locations/12345")).toBe(true)
      expect(leboncoinParser.matches("https://www.leboncoin.fr/voitures/12345")).toBe(false)
      expect(leboncoinParser.matches("https://seloger.com/annonces/123")).toBe(false)
    })

    it("SeLoger reconnaît /annonces/", () => {
      expect(selogerParser.matches("https://www.seloger.com/annonces/locations/appartement/12345.htm")).toBe(true)
      expect(selogerParser.matches("https://seloger.com/annonces/x.htm")).toBe(true)
      expect(selogerParser.matches("https://seloger.com/about")).toBe(false)
    })

    it("PAP reconnaît /annonces/", () => {
      expect(papParser.matches("https://www.pap.fr/annonces/12345")).toBe(true)
      expect(papParser.matches("https://www.pap.fr/contact")).toBe(false)
    })

    it("Bien'ici reconnaît /annonce/", () => {
      expect(bieniciParser.matches("https://www.bienici.com/annonce/location/paris-15e/appart/abc")).toBe(true)
    })

    it("Logic-immo reconnaît /detail-", () => {
      expect(logicImmoParser.matches("https://www.logic-immo.com/detail-location-12345.htm")).toBe(true)
    })

    it("Generic matche tout", () => {
      expect(genericOgParser.matches("https://random-site.fr/page")).toBe(true)
    })
  })

  describe("findParser priority", () => {
    it("Leboncoin avant generic", () => {
      const p = findParser("https://www.leboncoin.fr/ad/locations/1")
      expect(p?.name).toBe("leboncoin")
    })

    it("URL non reconnue → generic fallback", () => {
      const p = findParser("https://random.fr/page")
      expect(p?.name).toBe("generic")
    })

    it("SeLoger avant generic", () => {
      const p = findParser("https://www.seloger.com/annonces/locations/test.htm")
      expect(p?.name).toBe("seloger")
    })
  })

  describe("Leboncoin parser", () => {
    it("extrait depuis __NEXT_DATA__", async () => {
      const html = `
        <html>
        <head><title>Studio Paris 15</title></head>
        <body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: { pageProps: { ad: {
            subject: "Studio 25m² Paris 15",
            body: "Beau studio meublé",
            price: [1100],
            list_id: 9876,
            attributes: [
              { key: "square", value: "25" },
              { key: "rooms", value: "1" },
              { key: "real_estate_type", value: "Appartement" },
              { key: "furnished", value: "meuble" },
              { key: "energy_rate", value: "C" },
              { key: "monthly_rent", value: "1100" },
              { key: "charges_amount", value: "80" },
              { key: "parking", value: "1" },
              { key: "balcon", value: "1" },
            ],
            location: { city: "Paris 15", zipcode: "75015", lat: 48.84, lng: 2.30 },
            images: { urls: ["https://lbc.fr/a.jpg", "https://lbc.fr/b.jpg"] },
          }}}
        })}</script>
        </body></html>`
      const out = await leboncoinParser.parse(html, "https://leboncoin.fr/ad/locations/9876")
      expect(out.title).toContain("Studio 25m²")
      expect(out.surface).toBe(25)
      expect(out.rooms).toBe(1)
      expect(out.price).toBe(1100)
      expect(out.charges).toBe(80)
      expect(out.dpe).toBe("C")
      expect(out.city).toBe("Paris 15")
      expect(out.postal_code).toBe("75015")
      expect(out.lat).toBe(48.84)
      expect(out.lng).toBe(2.30)
      expect(out.photos).toHaveLength(2)
      expect(out.equipments).toContain("parking")
      expect(out.equipments).toContain("balcon")
      expect(out.furnished).toBe(true)
      expect(out.source_id).toBe("9876")
    })

    it("fallback OG sur HTML sans __NEXT_DATA__", async () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Annonce Leboncoin">
          <meta property="og:description" content="Description">
          <meta property="og:image" content="https://x.jpg">
        </head></html>`
      const out = await leboncoinParser.parse(html, "https://leboncoin.fr/x")
      expect(out.title).toBe("Annonce Leboncoin")
      expect(out.description).toBe("Description")
      expect(out.photos).toEqual(["https://x.jpg"])
      expect(out.warnings).toBeDefined()
    })
  })

  describe("SeLoger parser", () => {
    it("extrait depuis JSON-LD RealEstateListing", async () => {
      const html = `<script type="application/ld+json">${JSON.stringify({
        "@type": "RealEstateListing",
        name: "Appartement 3 pièces",
        description: "Lumineux 3P",
        offers: { price: 1450, priceCurrency: "EUR" },
        floorSize: { value: 65, unitCode: "MTK" },
        numberOfRooms: 3,
        numberOfBedrooms: 2,
        address: {
          addressLocality: "Lyon",
          postalCode: "69003",
          streetAddress: "12 rue X",
        },
        geo: { latitude: 45.75, longitude: 4.85 },
        image: ["https://sl.fr/1.jpg", "https://sl.fr/2.jpg"],
      })}</script>`
      const out = await selogerParser.parse(html, "https://seloger.com/annonces/x.htm")
      expect(out.title).toBe("Appartement 3 pièces")
      expect(out.price).toBe(1450)
      expect(out.surface).toBe(65)
      expect(out.rooms).toBe(3)
      expect(out.bedrooms).toBe(2)
      expect(out.city).toBe("Lyon")
      expect(out.postal_code).toBe("69003")
      expect(out.lat).toBe(45.75)
      expect(out.lng).toBe(4.85)
      expect(out.photos).toEqual(["https://sl.fr/1.jpg", "https://sl.fr/2.jpg"])
    })

    it("warning si pas de photos", async () => {
      const html = `<script type="application/ld+json">${JSON.stringify({
        "@type": "RealEstateListing", name: "Test",
      })}</script>`
      const out = await selogerParser.parse(html, "https://seloger.com/annonces/x.htm")
      expect(out.warnings?.join(" ")).toContain("Photos non importées")
    })
  })

  describe("Generic OG parser", () => {
    it("extrait OG basique", async () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Beau studio 25m²">
          <meta property="og:description" content="À louer Paris">
          <meta property="og:image" content="https://x.fr/img.jpg">
        </head><body>
        <p>Loyer : 1200 € / mois</p>
        <p>Surface : 25 m²</p>
        </body></html>`
      const out = await genericOgParser.parse(html, "https://random.fr/page")
      expect(out.title).toBe("Beau studio 25m²")
      expect(out.description).toBe("À louer Paris")
      expect(out.photos).toEqual(["https://x.fr/img.jpg"])
      expect(out.price).toBe(1200)
      expect(out.surface).toBe(25)
      expect(out.warnings?.length).toBeGreaterThan(0)
    })
  })

  describe("PAP parser", () => {
    it("OG fallback minimal", async () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Loft PAP">
        </head><body><p>Surface : 45 m²</p></body></html>`
      const out = await papParser.parse(html, "https://pap.fr/annonces/x")
      expect(out.title).toBe("Loft PAP")
      expect(out.surface).toBe(45)
    })
  })

  describe("Bien'ici parser", () => {
    it("JSON-LD basique", async () => {
      const html = `<script type="application/ld+json">${JSON.stringify({
        "@type": "Apartment",
        name: "Studio Marseille",
        offers: { price: 700 },
        floorSize: { value: 22 },
        numberOfRooms: 1,
      })}</script>`
      const out = await bieniciParser.parse(html, "https://bienici.com/annonce/x")
      expect(out.title).toBe("Studio Marseille")
      expect(out.price).toBe(700)
      expect(out.surface).toBe(22)
      expect(out.rooms).toBe(1)
    })
  })

  describe("Logic-immo parser", () => {
    it("regex prix/surface fallback", async () => {
      const html = `
        <html><head><meta property="og:title" content="Test"></head>
        <body><div>950 €/mois</div><div>40 m²</div></body></html>`
      const out = await logicImmoParser.parse(html, "https://logic-immo.com/detail-x")
      expect(out.title).toBe("Test")
      expect(out.price).toBe(950)
      expect(out.surface).toBe(40)
    })
  })
})
