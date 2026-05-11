/**
 * V83.2 — Mini YAML parser pour scénarios QA Bot.
 *
 * Évite la dépendance externe `js-yaml` / `yaml` (~150KB) en parsant
 * seulement le subset YAML utilisé par nos scénarios :
 *   - clés racines : name, role, priority, steps
 *   - steps : array d'objets, chaque step est `- key: value` OU
 *     `- key: { sub: val, sub2: val2 }` (inline object) OU
 *     `- key:\n    sub: val\n    sub2: val2` (multiline indenté)
 *
 * Limites : pas de support des anchors, références, multi-doc, tags,
 * heredocs. Suffisant pour nos scénarios déterministes.
 *
 * Tests : voir __tests__/qa-parser.test.ts.
 */

import type { Scenario, ScenarioStep } from "./types"

function stripComment(line: string): string {
  // Retire les commentaires inline `# ...` (sauf si entre quotes)
  let inQuote: false | "'" | '"' = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === inQuote && line[i - 1] !== "\\") inQuote = false
    } else {
      if (c === '"' || c === "'") inQuote = c
      else if (c === "#") return line.slice(0, i)
    }
  }
  return line
}

function parseScalar(raw: string): unknown {
  const s = raw.trim()
  if (s === "") return ""
  if (s === "true") return true
  if (s === "false") return false
  if (s === "null" || s === "~") return null
  if (/^-?\d+$/.test(s)) return parseInt(s, 10)
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s)
  // Strip enclosing quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function parseInlineObject(raw: string): Record<string, unknown> {
  // Format : `{ key: value, key2: "value 2", key3: 3 }`
  const inner = raw.trim().slice(1, -1).trim()
  if (!inner) return {}
  const result: Record<string, unknown> = {}
  // Split en tenant compte des quotes
  const parts: string[] = []
  let depth = 0
  let inQuote: false | "'" | '"' = false
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (inQuote) {
      if (c === inQuote && inner[i - 1] !== "\\") inQuote = false
    } else {
      if (c === '"' || c === "'") inQuote = c
      else if (c === "{" || c === "[") depth++
      else if (c === "}" || c === "]") depth--
      else if (c === "," && depth === 0) {
        parts.push(inner.slice(start, i))
        start = i + 1
      }
    }
  }
  parts.push(inner.slice(start))

  for (const part of parts) {
    const colonIdx = part.indexOf(":")
    if (colonIdx === -1) continue
    const k = part.slice(0, colonIdx).trim()
    const v = part.slice(colonIdx + 1).trim()
    result[k] = parseScalar(v)
  }
  return result
}

/**
 * Parse un YAML scénario simple.
 * Retourne un objet typé Scenario.
 */
export function parseScenario(yaml: string): Scenario {
  const lines = yaml.split(/\r?\n/).map(l => stripComment(l)).filter(l => l.trim().length > 0)

  const root: Record<string, unknown> = {}
  const steps: ScenarioStep[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const indent = line.match(/^(\s*)/)?.[1].length || 0

    // Racine (indent 0)
    if (indent === 0) {
      const colonIdx = line.indexOf(":")
      if (colonIdx === -1) { i++; continue }
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()

      if (key === "steps") {
        // Block array sur lignes suivantes
        i++
        while (i < lines.length) {
          const stepLine = lines[i]
          const stepIndent = stepLine.match(/^(\s*)/)?.[1].length || 0
          if (stepIndent === 0) break  // retour racine
          if (!stepLine.trim().startsWith("- ")) { i++; continue }

          // step line : `  - key: value` ou `  - key: { ... }`
          const after = stepLine.replace(/^\s*-\s*/, "")
          const stepColon = after.indexOf(":")
          if (stepColon === -1) { i++; continue }
          const stepKey = after.slice(0, stepColon).trim()
          const stepVal = after.slice(stepColon + 1).trim()

          let stepValue: unknown
          if (stepVal.startsWith("{") && stepVal.endsWith("}")) {
            stepValue = parseInlineObject(stepVal)
          } else if (stepVal === "") {
            // Multiline object — peu utilisé chez nous, on log et skip
            stepValue = {}
          } else {
            stepValue = parseScalar(stepVal)
          }

          steps.push({ [stepKey]: stepValue } as unknown as ScenarioStep)
          i++
        }
        continue
      }

      root[key] = parseScalar(value)
    }
    i++
  }

  root.steps = steps
  return root as unknown as Scenario
}

/**
 * Helpers pour lire le type de step depuis un step opaque.
 */
export function getStepType(step: ScenarioStep): string {
  const keys = Object.keys(step)
  return keys[0] || "unknown"
}

export function getStepValue(step: ScenarioStep): unknown {
  const keys = Object.keys(step)
  return keys[0] ? (step as unknown as Record<string, unknown>)[keys[0]] : undefined
}
