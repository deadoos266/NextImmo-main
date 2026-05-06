// Génère /public/annonce-placeholder.jpg — image neutre 1200×800 utilisée
// quand une annonce n'a pas de photos uploadées.
//
// Usage : node scripts/generate-annonce-placeholder.mjs
//
// Design : gradient beige + icône maison stylisée + label "Photos à venir"
// dans la palette KeyMatch (#F7F4EF beige, #EAE6DF accent, #111 noir).

import sharp from "sharp"
import { writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, "..", "public", "annonce-placeholder.jpg")

const SVG = `
<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F7F4EF"/>
      <stop offset="100%" stop-color="#EAE6DF"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="800" fill="url(#bg)"/>

  <!-- Maison stylisée centrée (icône SVG) -->
  <g transform="translate(600, 360)">
    <!-- Toit triangulaire -->
    <path d="M -120 0 L 0 -100 L 120 0 Z" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round" opacity="0.45"/>
    <!-- Mur principal -->
    <rect x="-100" y="0" width="200" height="140" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round" opacity="0.45"/>
    <!-- Porte -->
    <rect x="-25" y="50" width="50" height="90" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round" opacity="0.45"/>
    <!-- Fenêtre gauche -->
    <rect x="-75" y="20" width="35" height="35" fill="none" stroke="#111" stroke-width="3" stroke-linejoin="round" opacity="0.35"/>
    <!-- Fenêtre droite -->
    <rect x="40" y="20" width="35" height="35" fill="none" stroke="#111" stroke-width="3" stroke-linejoin="round" opacity="0.35"/>
  </g>

  <!-- Label "Photos à venir" -->
  <text x="600" y="580" text-anchor="middle" font-family="serif" font-style="italic" font-size="38" font-weight="500" fill="#111" opacity="0.6" letter-spacing="-0.5">
    Photos à venir
  </text>
  <text x="600" y="620" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="500" fill="#5a5247" opacity="0.6" letter-spacing="0.4">
    Le propriétaire complétera bientôt l'annonce
  </text>
</svg>
`.trim()

const jpg = await sharp(Buffer.from(SVG))
  .jpeg({ quality: 82, progressive: true, mozjpeg: true })
  .toBuffer()

await writeFile(OUT, jpg)
console.log(`✅ ${OUT} (${jpg.length} bytes, 1200×800)`)
