/**
 * V83.8 — CLI : `pnpm qa:run <scenario.yaml>`
 *
 * Usage :
 *   pnpm qa:run qa/scenarios/01-locataire-recherche-paris.yaml
 *   pnpm qa:run --all
 *
 * Exécute le(s) scénario(s) via Playwright local et POST le résultat
 * vers /api/qa/run (utilise BASE_URL local ou QA_API_URL env var).
 *
 * NOTE : Playwright doit être installé (`npm run test:e2e:install` une fois).
 */

import { readFile, readdir } from "fs/promises"
import { join } from "path"
import { runScenario } from "../lib/qa/runner"
import { parseScenario } from "../lib/qa/parser"

const BASE_URL = process.env.QA_BASE_URL || "http://localhost:3000"
const API_URL = process.env.QA_API_URL || `${BASE_URL}/api/qa/run`
const CRON_SECRET = process.env.CRON_SECRET || ""

async function runOne(file: string) {
  console.log(`\n=== Running: ${file} ===`)
  const fullPath = file.startsWith("/") ? file : join(process.cwd(), file)
  const yaml = await readFile(fullPath, "utf-8")
  const scenario = parseScenario(yaml)
  const fileName = fullPath.split(/[\\/]/).pop() || file

  const result = await runScenario(scenario, fileName, {
    baseUrl: BASE_URL,
    // Pas de Storage upload côté CLI local — les screenshots restent
    // en mémoire et seraient transmises au runner externe pour upload.
    // En MVP, on log juste les noms.
  })

  console.log(`Status: ${result.status} (${result.steps_passed}/${result.steps_total})`)
  console.log(`Duration: ${(result.duration_ms / 1000).toFixed(1)}s`)
  if (result.errors.length > 0) {
    console.log("Errors:")
    result.errors.forEach(e => console.log(`  - Step ${e.step_index}: ${e.message}`))
  }

  // POST vers API si CRON_SECRET défini
  if (CRON_SECRET) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CRON_SECRET}`,
        },
        body: JSON.stringify({ result }),
      })
      const j = await res.json()
      if (j.ok) console.log(`Stored: run_id=${j.run_id}`)
      else console.log(`POST failed: ${j.error}`)
    } catch (e) {
      console.log(`POST error: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    console.log("(CRON_SECRET non défini — résultat non POST en DB)")
  }
}

async function runAll() {
  const dir = join(process.cwd(), "qa", "scenarios")
  const files = await readdir(dir)
  const yamlFiles = files.filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort()
  for (const f of yamlFiles) {
    await runOne(`qa/scenarios/${f}`)
  }
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.log("Usage: pnpm qa:run <scenario.yaml> | --all")
    process.exit(1)
  }
  if (arg === "--all") {
    await runAll()
  } else {
    await runOne(arg)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
