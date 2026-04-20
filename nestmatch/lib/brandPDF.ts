import type jsPDFType from "jspdf"
import { BRAND } from "./brand"
import { LOGO_PNG_BASE64 } from "./brand-logo"

type JsPDF = InstanceType<typeof jsPDFType>

type DrawOpts = {
  x: number
  y: number
  /** Affichage texte à côté du logo (défaut true). */
  showText?: boolean
  /** Couleur du texte à côté (défaut #111). Pas applicable au logo (SVG fixe). */
  color?: string
  /** Taille visuelle du logo + texte. */
  size?: "small" | "medium" | "large"
}

/**
 * Dessine le logo KeyMatch (icône PNG + nom) dans un PDF jsPDF.
 *
 * Le PNG 256x256 est embarqué en base64 dans `lib/brand-logo.ts` — généré
 * depuis `public/logo-mark.svg` par `scripts/generate-logo-assets.js`. Pour
 * le régénérer après modification du SVG : `node scripts/generate-logo-assets.js`.
 *
 * (x, y) est le coin haut-gauche du logo. Le texte (si affiché) est placé
 * à droite, verticalement centré sur le logo.
 */
export function drawLogoPDF(doc: JsPDF, opts: DrawOpts): void {
  const size = opts.size || "medium"
  // Dimensions visuelles (en unités jsPDF — mm par défaut)
  const iconSize = size === "small" ? 7 : size === "large" ? 14 : 10
  const fontSize = size === "small" ? 11 : size === "large" ? 18 : 14
  const gap = size === "small" ? 2 : size === "large" ? 4 : 3

  // Icône (addImage accepte une data URI base64 ou un Buffer)
  try {
    doc.addImage(LOGO_PNG_BASE64, "PNG", opts.x, opts.y, iconSize, iconSize)
  } catch (err) {
    // Fallback si addImage échoue pour une raison technique : on dessine juste
    // le texte. On ne veut surtout pas bloquer la génération du PDF entier.
    console.error("[brandPDF] drawLogoPDF addImage failed", err)
  }

  const showText = opts.showText !== false
  if (!showText) return

  const prevFont = doc.getFont()
  doc.setFont("helvetica", "bold")
  doc.setFontSize(fontSize)

  if (opts.color) {
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

  // Texte aligné verticalement sur le centre de l'icône. La baseline texte
  // jsPDF est au 3/4 de la hauteur visuelle, donc on place à y + iconSize/2
  // + fontSize/3 pour viser le centre optique.
  const textX = opts.x + iconSize + gap
  const textY = opts.y + iconSize / 2 + fontSize / 10

  doc.text(BRAND.name, textX, textY)

  // Reset pour ne pas polluer l'état jsPDF de l'appelant
  doc.setTextColor(0, 0, 0)
  doc.setFont(prevFont.fontName, prevFont.fontStyle)
}

/**
 * Renvoie l'URL absolue du logo PNG pour les emails HTML transactionnels
 * (si jamais on veut un img distant au lieu du SVG inline). Résolu depuis
 * NEXT_PUBLIC_URL ou BRAND.url.
 */
export function logoEmailUrl(): string {
  const base = process.env.NEXT_PUBLIC_URL || BRAND.url
  return `${base.replace(/\/$/, "")}/logo-mark-256.png`
}
