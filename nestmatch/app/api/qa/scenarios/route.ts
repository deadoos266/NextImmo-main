/**
 * V83.3 — GET /api/qa/scenarios
 *
 * Liste les fichiers .yaml dans qa/scenarios/. Auth admin.
 * Utilisé par /admin/qa pour afficher les scénarios disponibles à lancer.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { listScenarios, readScenarioFile } from "@/lib/qa/storage"
import { parseScenario } from "@/lib/qa/parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const files = await listScenarios()
  const scenarios = await Promise.all(files.map(async f => {
    const yaml = await readScenarioFile(f)
    if (!yaml) return null
    try {
      const parsed = parseScenario(yaml)
      return {
        file: f,
        name: parsed.name,
        role: parsed.role || "anonymous",
        priority: parsed.priority || "P2",
        steps_count: parsed.steps.length,
      }
    } catch (err) {
      return {
        file: f,
        name: f,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }))

  return NextResponse.json({ ok: true, scenarios: scenarios.filter(Boolean) })
}
