// Génère /public/og-default.png 1200×630 (open-graph + twitter card par défaut).
//
// Usage : node scripts/generate-og-default.mjs
//
// Lance en local quand le design change. Le résultat est commité dans le repo
// (pas généré au runtime) pour être servi statiquement par Vercel sans cold-start.

import sharp from "sharp"
import { writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, "..", "public", "og-default.png")

// Design system KeyMatch :
//   Fond beige #F7F4EF · Accent #EAE6DF · Noir #111
//   Fraunces italic pour le titre éditorial · DM Sans pour le reste
//
// On reste sur des polices "system-safe" dans le SVG (sharp ne charge pas
// next/font). Fraunces dégrade en serif italic du système, DM Sans en
// sans-serif. Cohérent avec le rendu Open Graph (les crawlers ne font pas
// de font swap, ils prennent le PNG figé).
const SVG = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F4EF"/>
      <stop offset="100%" stop-color="#EAE6DF"/>
    </linearGradient>
  </defs>

  <!-- Fond -->
  <rect width="1200" height="630" fill="url(#grad)"/>

  <!-- Bandeau décoratif vertical -->
  <rect x="0" y="0" width="12" height="630" fill="#111"/>

  <!-- Logo lettre K dans un cercle -->
  <circle cx="120" cy="120" r="44" fill="#111"/>
  <text x="120" y="138" text-anchor="middle" font-family="serif" font-style="italic" font-size="48" font-weight="500" fill="#F7F4EF">K</text>

  <!-- Brand name à côté du logo -->
  <text x="180" y="135" font-family="sans-serif" font-size="32" font-weight="700" fill="#111" letter-spacing="-0.5">KeyMatch</text>

  <!-- Titre éditorial (Fraunces italic dégradé serif) -->
  <text x="80" y="320" font-family="serif" font-style="italic" font-size="76" font-weight="500" fill="#111" letter-spacing="-1">
    La location entre
  </text>
  <text x="80" y="400" font-family="serif" font-style="italic" font-size="76" font-weight="500" fill="#111" letter-spacing="-1">
    particuliers, sans agence.
  </text>

  <!-- Tagline / subhead (DM Sans dégradé sans-serif) -->
  <text x="80" y="470" font-family="sans-serif" font-size="26" font-weight="400" fill="#5a5247" letter-spacing="0.2">
    Score de matching · Dossier numérique · Bail signé en ligne
  </text>

  <!-- Domaine en bas à gauche, dans un chip -->
  <rect x="76" y="540" width="280" height="44" rx="22" fill="#111"/>
  <text x="216" y="568" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="#F7F4EF" letter-spacing="0.5">keymatch-immo.fr</text>

  <!-- Petit point décoratif en haut à droite -->
  <circle cx="1110" cy="90" r="6" fill="#111"/>
  <circle cx="1080" cy="90" r="6" fill="#111" opacity="0.4"/>
  <circle cx="1050" cy="90" r="6" fill="#111" opacity="0.2"/>
</svg>
`.trim()

const png = await sharp(Buffer.from(SVG))
  .png({ compressionLevel: 9, quality: 92 })
  .toBuffer()

await writeFile(OUT, png)
console.log(`✅ ${OUT} (${png.length} bytes, 1200×630)`)
