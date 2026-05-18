/**
 * V97.39.34 — Tests parser Apimo XML
 */

import { describe, it, expect } from "vitest"
import { parseApimoXML } from "../import/apimo"

describe("parseApimoXML — structure standard", () => {
  it("parse XML Apimo simple avec un listing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<export>
  <listings>
    <listing>
      <id>12345</id>
      <reference>REF-001</reference>
      <type>1</type>
      <category>2</category>
      <city><name>Paris</name></city>
      <postal_code>75011</postal_code>
      <address>12 rue de la Roquette</address>
      <price>1200</price>
      <charges>50</charges>
      <deposit>2400</deposit>
      <area>45</area>
      <rooms>3</rooms>
      <bedrooms>2</bedrooms>
      <floor>3</floor>
      <energy>D</energy>
      <description>Beau T3 lumineux</description>
    </listing>
  </listings>
</export>`
    const { annonces, warnings } = parseApimoXML(xml)
    expect(annonces).toHaveLength(1)
    const a = annonces[0]
    expect(a.external_ref).toBe("12345")
    expect(a.type_bien).toBe("Appartement")
    expect(a.ville).toBe("Paris")
    expect(a.code_postal).toBe("75011")
    expect(a.adresse).toBe("12 rue de la Roquette")
    expect(a.prix).toBe(1200)
    expect(a.charges).toBe(50)
    expect(a.caution).toBe(2400)
    expect(a.surface).toBe(45)
    expect(a.pieces).toBe(3)
    expect(a.chambres).toBe(2)
    expect(a.etage).toBe(3)
    expect(a.dpe).toBe("D")
    expect(a.description).toBe("Beau T3 lumineux")
    expect(warnings).toEqual([])
  })

  it("parse plusieurs listings", () => {
    const xml = `<export><listings>
      <listing><id>1</id><category>2</category><city><name>Paris</name></city><price>900</price><area>22</area></listing>
      <listing><id>2</id><category>2</category><city><name>Lyon</name></city><price>1100</price><area>40</area></listing>
    </listings></export>`
    const { annonces } = parseApimoXML(xml)
    expect(annonces).toHaveLength(2)
    expect(annonces[0].external_ref).toBe("1")
    expect(annonces[1].external_ref).toBe("2")
  })

  it("accepte la racine alternative <export><properties><property>", () => {
    const xml = `<export><properties>
      <property><id>X1</id><category>2</category><city><name>Paris</name></city><price>500</price></property>
    </properties></export>`
    const { annonces } = parseApimoXML(xml)
    expect(annonces).toHaveLength(1)
    expect(annonces[0].external_ref).toBe("X1")
  })
})

describe("parseApimoXML — type mapping", () => {
  function withType(typeCode: string) {
    return parseApimoXML(`<export><listings><listing><id>1</id><type>${typeCode}</type><category>2</category><city><name>X</name></city><price>100</price></listing></listings></export>`).annonces[0]
  }

  it("type=1 → Appartement", () => {
    expect(withType("1").type_bien).toBe("Appartement")
  })

  it("type=2 → Maison", () => {
    expect(withType("2").type_bien).toBe("Maison")
  })

  it("type=7 → Studio", () => {
    expect(withType("7").type_bien).toBe("Studio")
  })

  it("type inconnu → fallback Appartement", () => {
    expect(withType("999").type_bien).toBe("Appartement")
  })
})

describe("parseApimoXML — options/équipements", () => {
  function withOptions(options: string[]) {
    const optsXml = options.map(o => `<option>${o}</option>`).join("")
    const xml = `<export><listings><listing><id>1</id><category>2</category><city><name>X</name></city><price>100</price><options>${optsXml}</options></listing></listings></export>`
    return parseApimoXML(xml).annonces[0]
  }

  it("FURNISHED → meuble:true", () => {
    expect(withOptions(["FURNISHED"]).meuble).toBe(true)
  })

  it("PARKING → parking:true", () => {
    expect(withOptions(["PARKING"]).parking).toBe(true)
  })

  it("BALCONY → balcon:true (mapping EN)", () => {
    expect(withOptions(["BALCONY"]).balcon).toBe(true)
  })

  it("plusieurs options simultanées", () => {
    const a = withOptions(["FURNISHED", "PARKING", "TERRASSE", "ASCENSEUR"])
    expect(a.meuble).toBe(true)
    expect(a.parking).toBe(true)
    expect(a.terrasse).toBe(true)
    expect(a.ascenseur).toBe(true)
  })

  it("option inconnue ignorée silencieusement", () => {
    const a = withOptions(["UNKNOWN_OPTION", "PARKING"])
    expect(a.parking).toBe(true)
    expect(a.meuble).toBeUndefined()
  })
})

describe("parseApimoXML — photos", () => {
  it("parse pictures avec balise <url>", () => {
    const xml = `<export><listings><listing><id>1</id><category>2</category><city><name>X</name></city><price>100</price>
      <pictures>
        <picture><url>https://a.com/1.jpg</url></picture>
        <picture><url>https://a.com/2.jpg</url></picture>
      </pictures>
    </listing></listings></export>`
    const { annonces } = parseApimoXML(xml)
    expect(annonces[0].photos).toEqual(["https://a.com/1.jpg", "https://a.com/2.jpg"])
  })

  it("photos absentes → null", () => {
    const xml = `<export><listings><listing><id>1</id><category>2</category><city><name>X</name></city><price>100</price></listing></listings></export>`
    const { annonces } = parseApimoXML(xml)
    expect(annonces[0].photos).toBeNull()
  })
})

describe("parseApimoXML — filtres", () => {
  it("ignore les category != 2 (vente)", () => {
    const xml = `<export><listings>
      <listing><id>1</id><category>1</category><city><name>P</name></city><price>500000</price></listing>
      <listing><id>2</id><category>2</category><city><name>L</name></city><price>800</price></listing>
    </listings></export>`
    const { annonces, warnings } = parseApimoXML(xml)
    expect(annonces).toHaveLength(1)
    expect(annonces[0].external_ref).toBe("2")
    expect(warnings.some(w => w.includes("category=1"))).toBe(true)
  })

  it("accepte category='location' (variante texte)", () => {
    const xml = `<export><listings>
      <listing><id>1</id><category>location</category><city><name>P</name></city><price>500</price></listing>
    </listings></export>`
    const { annonces } = parseApimoXML(xml)
    expect(annonces).toHaveLength(1)
  })
})

describe("parseApimoXML — robustesse", () => {
  it("rejette XML invalide", () => {
    expect(() => parseApimoXML("not xml")).toThrow()
  })

  it("rejette XML sans <listing>", () => {
    expect(() => parseApimoXML("<root></root>")).toThrow(/listing.*ou.*property/i)
  })

  it("gère les fields optionnels manquants", () => {
    const xml = `<export><listings><listing><id>1</id><category>2</category><city><name>X</name></city><price>100</price></listing></listings></export>`
    const { annonces } = parseApimoXML(xml)
    expect(annonces[0].surface).toBeNull()
    expect(annonces[0].chambres).toBeNull()
    expect(annonces[0].dpe).toBeNull()
  })

  it("génère un titre par défaut si absent", () => {
    const xml = `<export><listings><listing><id>1</id><type>1</type><category>2</category><city><name>Paris</name></city><price>100</price></listing></listings></export>`
    const { annonces } = parseApimoXML(xml)
    expect(annonces[0].titre).toContain("Appartement")
  })
})
