/* eslint-disable no-console */
/**
 * V38.4 — Script de maintenance trimestrielle IRL.
 * Audit V37 R37.2.
 *
 * Le tableau IRL_HISTORIQUE dans lib/irl.ts est hardcodé. À chaque
 * publication INSEE (4× par an : T1=avril, T2=juillet, T3=octobre,
 * T4=janvier), il faut ajouter la nouvelle entrée en TÊTE du tableau.
 *
 * Usage manuel :
 *   npm run update-irl
 *
 * Le script :
 * 1. Affiche le tableau actuel (date + indice + variation).
 * 2. Vérifie si le trimestre attendu (= dernier publié à la date du jour)
 *    est présent. Si oui : "OK, à jour".
 * 3. Sinon : prompt l'opérateur de saisir l'indice + la variation et
 *    génère le diff lib/irl.ts à appliquer manuellement.
 *
 * Source officielle : https://www.insee.fr/fr/statistiques/serie/001515333
 *
 * Pas d'API INSEE auto sans OAuth (clé Bnsee — possible chantier V39).
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as readline from "node:readline"

const IRL_FILE = path.resolve(__dirname, "..", "lib", "irl.ts")

interface IrlEntry {
  trimestre: string
  annee: number
  trimNum: 1 | 2 | 3 | 4
  indice: number
  publicationDate: string
  variation: string
}

function expectedTrimestre(now: Date = new Date()): { annee: number; trimNum: 1 | 2 | 3 | 4; trimLabel: string; pubMonth: string } {
  // Mois publication INSEE :
  //   - T1 (jan-mars) publié en avril (mois 4)
  //   - T2 (avr-juin) publié en juillet (mois 7)
  //   - T3 (juil-sept) publié en octobre (mois 10)
  //   - T4 (oct-déc) publié en janvier de l'année suivante (mois 1)
  const m = now.getMonth() + 1 // 1-12
  const y = now.getFullYear()
  // Détecte le dernier trimestre dont la publication a eu lieu.
  if (m >= 4 && m < 7) return { annee: y, trimNum: 1, trimLabel: `T1 ${y}`, pubMonth: "Avril" }
  if (m >= 7 && m < 10) return { annee: y, trimNum: 2, trimLabel: `T2 ${y}`, pubMonth: "Juillet" }
  if (m >= 10) return { annee: y, trimNum: 3, trimLabel: `T3 ${y}`, pubMonth: "Octobre" }
  // Janvier-mars : la dernière publication est T4 de l'année précédente.
  return { annee: y - 1, trimNum: 4, trimLabel: `T4 ${y - 1}`, pubMonth: "Janvier" }
}

function readHistorique(): { entries: IrlEntry[]; raw: string } {
  const raw = fs.readFileSync(IRL_FILE, "utf8")
  // Parse heuristique : on trouve les blocs `{ trimestre: "T1 2026", ... }`.
  const re = /\{\s*trimestre:\s*"([^"]+)",\s*annee:\s*(\d+),\s*trimNum:\s*(\d+),\s*indice:\s*([\d.]+),\s*publicationDate:\s*"([^"]+)",\s*variation:\s*"([^"]+)"\s*\}/g
  const entries: IrlEntry[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    entries.push({
      trimestre: m[1],
      annee: Number(m[2]),
      trimNum: Number(m[3]) as 1 | 2 | 3 | 4,
      indice: Number(m[4]),
      publicationDate: m[5],
      variation: m[6],
    })
  }
  return { entries, raw }
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main(): Promise<void> {
  console.log("📈 IRL maintenance script — KeyMatch V38.4\n")

  const expected = expectedTrimestre()
  console.log(`Trimestre attendu : ${expected.trimLabel} (publié en ${expected.pubMonth} ${expected.pubMonth === "Janvier" ? expected.annee + 1 : expected.annee})\n`)

  const { entries } = readHistorique()
  if (entries.length === 0) {
    console.error("⚠ Impossible de parser lib/irl.ts. Vérifier le format.")
    process.exit(1)
  }
  const last = entries[0]
  console.log(`Dernier IRL connu : ${last.trimestre} = ${last.indice} (${last.variation})\n`)

  const isUpToDate = last.annee === expected.annee && last.trimNum === expected.trimNum
  if (isUpToDate) {
    console.log("✓ IRL_HISTORIQUE est à jour. Rien à faire.")
    return
  }

  console.log(`⚠ IRL_HISTORIQUE manque ${expected.trimLabel}.`)
  console.log("\nSource officielle :")
  console.log("  https://www.insee.fr/fr/statistiques/serie/001515333\n")

  const indiceStr = await prompt(`Indice ${expected.trimLabel} (ex 145.66) : `)
  const indice = Number(indiceStr)
  if (!Number.isFinite(indice) || indice <= 0) {
    console.error("⚠ Indice invalide.")
    process.exit(1)
  }
  const variation = (((indice / last.indice) - 1) * 100).toFixed(2)
  const variationStr = `+${variation}%`

  const newEntry = `  { trimestre: "${expected.trimLabel}", annee: ${expected.annee}, trimNum: ${expected.trimNum}, indice: ${indice}, publicationDate: "${expected.pubMonth} ${expected.pubMonth === "Janvier" ? expected.annee + 1 : expected.annee}", variation: "${variationStr}" },`
  console.log(`\n📋 Diff à appliquer dans lib/irl.ts :\n`)
  console.log(`   Insère cette ligne en TÊTE de IRL_HISTORIQUE (juste après "export const IRL_HISTORIQUE: IrlEntry[] = [") :\n`)
  console.log(`${newEntry}\n`)

  const confirm = await prompt("Appliquer automatiquement le diff ? (y/N) : ")
  if (confirm.toLowerCase() !== "y") {
    console.log("\n→ Diff non appliqué. Copie/colle manuellement la ligne ci-dessus.")
    return
  }

  // Patch automatique
  const fileRaw = fs.readFileSync(IRL_FILE, "utf8")
  const marker = "export const IRL_HISTORIQUE: IrlEntry[] = ["
  const idx = fileRaw.indexOf(marker)
  if (idx === -1) {
    console.error("⚠ Marker non trouvé. Édition manuelle requise.")
    process.exit(1)
  }
  const insertPos = idx + marker.length
  const before = fileRaw.slice(0, insertPos)
  const after = fileRaw.slice(insertPos)
  // Ajoute un commentaire de maintenance
  const stamp = new Date().toISOString().slice(0, 10)
  const block = `\n  // Maintenu via scripts/update-irl.ts le ${stamp}\n${newEntry}`
  fs.writeFileSync(IRL_FILE, before + block + after, "utf8")

  console.log(`\n✓ ${IRL_FILE} mis à jour.`)
  console.log("→ Vérifier le diff avec git diff, lancer les tests, commit.\n")
}

void main().catch(err => {
  console.error(err)
  process.exit(1)
})
