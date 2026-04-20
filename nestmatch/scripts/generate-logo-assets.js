/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Génère les PNGs du logo KeyMatch depuis public/logo-mark.svg :
 *   - public/logo-mark-192.png   (PWA, OG, favicon alternatif)
 *   - public/logo-mark-512.png   (PWA maskable)
 *   - public/logo-mark-256.png   (PDF headers)
 *
 * Écrit aussi lib/brand-logo.ts avec la constante LOGO_PNG_BASE64 256x256
 * utilisée par brandPDF.ts pour dessiner le logo dans les PDFs (jsPDF
 * addImage).
 *
 * Usage : node scripts/generate-logo-assets.js
 */

const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const ROOT = path.resolve(__dirname, "..")
const SVG_PATH = path.join(ROOT, "public", "logo-mark.svg")
const OUT_192 = path.join(ROOT, "public", "logo-mark-192.png")
const OUT_512 = path.join(ROOT, "public", "logo-mark-512.png")
const OUT_256 = path.join(ROOT, "public", "logo-mark-256.png")
const OUT_APPLE = path.join(ROOT, "public", "apple-touch-icon.png")
const OUT_MASKABLE = path.join(ROOT, "public", "logo-mark-maskable-512.png")
const TS_OUT = path.join(ROOT, "lib", "brand-logo.ts")

async function main() {
  const svg = fs.readFileSync(SVG_PATH)

  // 192 + 512 + 256
  await sharp(svg)
    .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(OUT_192)
  await sharp(svg)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(OUT_512)
  const buf256 = await sharp(svg)
    .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  fs.writeFileSync(OUT_256, buf256)

  // apple-touch-icon : 180x180, fond plein F7F4EF (Apple n'aime pas la
  // transparence sur les tiles home-screen).
  await sharp(svg)
    .resize(150, 150, { fit: "contain", background: { r: 247, g: 244, b: 239, alpha: 1 } })
    .extend({ top: 15, bottom: 15, left: 15, right: 15, background: { r: 247, g: 244, b: 239, alpha: 1 } })
    .png()
    .toFile(OUT_APPLE)

  // Maskable 512 : le glyphe occupe max 80% du canvas, padding sur fond
  // couleur marque (les mobiles rognent en formes variables).
  await sharp(svg)
    .resize(400, 400, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: 56,
      bottom: 56,
      left: 56,
      right: 56,
      background: { r: 247, g: 244, b: 239, alpha: 1 },
    })
    .png()
    .toFile(OUT_MASKABLE)

  const base64 = buf256.toString("base64")
  const dataUri = `data:image/png;base64,${base64}`

  const ts = `/**
 * Logo KeyMatch — PNG 256x256 transparent encodé base64.
 * Généré automatiquement par scripts/generate-logo-assets.js depuis
 * public/logo-mark.svg. Ne pas éditer à la main — relancer le script.
 *
 * Utilisé par brandPDF.ts pour dessiner le logo dans les PDFs (jsPDF
 * addImage accepte une data URI base64).
 */

export const LOGO_PNG_BASE64 = "${dataUri}"

export const LOGO_PNG_WIDTH = 256
export const LOGO_PNG_HEIGHT = 256
`

  fs.writeFileSync(TS_OUT, ts)

  console.log("✓ Écrit :")
  console.log("  ", OUT_192, `(${(fs.statSync(OUT_192).size / 1024).toFixed(1)} Ko)`)
  console.log("  ", OUT_512, `(${(fs.statSync(OUT_512).size / 1024).toFixed(1)} Ko)`)
  console.log("  ", OUT_256, `(${(buf256.length / 1024).toFixed(1)} Ko)`)
  console.log("  ", OUT_APPLE, `(${(fs.statSync(OUT_APPLE).size / 1024).toFixed(1)} Ko)`)
  console.log("  ", OUT_MASKABLE, `(${(fs.statSync(OUT_MASKABLE).size / 1024).toFixed(1)} Ko)`)
  console.log("  ", TS_OUT, `(base64 ${(dataUri.length / 1024).toFixed(1)} Ko)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
