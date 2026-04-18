import type jsPDFType from "jspdf"
import { BRAND } from "./brand"

type JsPDF = InstanceType<typeof jsPDFType>

type DrawOpts = {
  x: number
  y: number
  color?: string
  size?: "small" | "medium" | "large"
}

/**
 * Dessine le logo NestMatch dans un PDF jsPDF (header document).
 *
 * Placeholder texte pour l'instant. Quand le logo vectoriel arrivera :
 *   1. Convertir le logo PNG 512×128 en base64.
 *   2. Assigner à LOGO_PNG_BASE64 ci-dessous.
 *   3. Remplacer le bloc texte par doc.addImage(LOGO_PNG_BASE64, "PNG", x, y, w, h).
 *   Toute la chaîne bénéficiera automatiquement (bail, quittance, EDL, dossier,
 *   historique loyers).
 */
export function drawLogoPDF(doc: JsPDF, opts: DrawOpts): void {
  const size = opts.size || "medium"
  const fontSize = size === "small" ? 12 : size === "large" ? 20 : 16
  const prevFont = doc.getFont()
  doc.setFont("helvetica", "bold")
  doc.setFontSize(fontSize)
  if (opts.color) {
    // Accepte hex #RRGGBB
    const hex = opts.color.replace("#", "")
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      doc.setTextColor(r, g, b)
    }
  } else {
    doc.setTextColor(17, 17, 17)
  }
  doc.text(BRAND.name, opts.x, opts.y)
  // Reset pour ne pas polluer l'état jsPDF de l'appelant
  doc.setTextColor(0, 0, 0)
  doc.setFont(prevFont.fontName, prevFont.fontStyle)
}

/**
 * Renvoie l'URL absolue du logo PNG pour les emails HTML transactionnels.
 * Résolu à partir de BRAND.url — modifiable via env NEXT_PUBLIC_URL.
 */
export function logoEmailUrl(): string {
  const base = process.env.NEXT_PUBLIC_URL || BRAND.url
  return `${base.replace(/\/$/, "")}/logo.svg`
}
