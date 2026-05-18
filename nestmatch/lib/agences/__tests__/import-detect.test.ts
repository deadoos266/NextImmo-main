/**
 * V97.39.34 — Tests détection format import bulk
 */

import { describe, it, expect } from "vitest"
import { detectFormat } from "../import/detect"

describe("detectFormat", () => {
  it("détecte Apimo XML avec <export><listings>", () => {
    expect(detectFormat(`<?xml version="1.0"?><export><listings></listings></export>`)).toBe("apimo")
  })

  it("détecte Apimo XML avec <listings> direct", () => {
    expect(detectFormat(`<listings><listing></listing></listings>`)).toBe("apimo")
  })

  it("détecte Apimo avec <properties>", () => {
    expect(detectFormat(`<root><properties><property></property></properties></root>`)).toBe("apimo")
  })

  it("détecte Hektor XML avec <annonces>", () => {
    expect(detectFormat(`<?xml version="1.0"?><annonces><annonce></annonce></annonces>`)).toBe("hektor")
  })

  it("détecte Hektor avec <BiensXMLImport>", () => {
    expect(detectFormat(`<BiensXMLImport><bien></bien></BiensXMLImport>`)).toBe("hektor")
  })

  it("détecte CSV avec virgule", () => {
    expect(detectFormat("titre,ville,prix\nStudio,Paris,900")).toBe("csv")
  })

  it("détecte CSV avec point-virgule (FR Excel)", () => {
    expect(detectFormat("titre;ville;prix\nStudio;Paris;900")).toBe("csv")
  })

  it("détecte CSV avec tabulations", () => {
    expect(detectFormat("titre\tville\tprix\nStudio\tParis\t900")).toBe("csv")
  })

  it("retourne unknown pour XML inconnu", () => {
    expect(detectFormat(`<?xml version="1.0"?><foo><bar></bar></foo>`)).toBe("unknown")
  })

  it("retourne unknown pour texte sans séparateur", () => {
    expect(detectFormat("juste du texte sans séparateurs")).toBe("unknown")
  })

  it("ignore les espaces en début de fichier", () => {
    expect(detectFormat("   \n<export><listings></listings></export>")).toBe("apimo")
    expect(detectFormat("   \ntitre,ville\nx,y")).toBe("csv")
  })
})
