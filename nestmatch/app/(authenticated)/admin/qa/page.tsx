import { supabaseAdmin } from "../../../../lib/supabase-server"
import { listScenarios, readScenarioFile } from "../../../../lib/qa/storage"
import { parseScenario } from "../../../../lib/qa/parser"
import QaAdminClient from "./QaAdminClient"

/**
 * V83.5 — /admin/qa — Tableau de bord QA Bot.
 *
 * Layout admin (app/(authenticated)/admin/layout.tsx) gère déjà l'auth.
 *
 * Sections :
 *  1. Stats top : Total runs 7j / Pass rate / Last run timestamp
 *  2. Scénarios disponibles (depuis qa/scenarios/*.yaml) — boutons "Run"
 *  3. Table des derniers 50 runs (status badge + duration + timestamp)
 *  4. Click ligne → modal détail (step results + screenshots + errors)
 *
 * Style : palette KeyMatch (#F7F4EF / #111 / Fraunces italic / DM Sans).
 */

export const metadata = {
  title: "QA Bot admin — KeyMatch",
  description: "Tableau de bord des tests autonomes du site.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

async function fetchRecentRuns(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("qa_runs")
    .select("id, scenario_name, scenario_file, status, started_at, finished_at, duration_ms, steps_total, steps_passed, steps_failed, trigger, triggered_by")
    .order("started_at", { ascending: false })
    .limit(limit)
  if (error) return []
  return data || []
}

async function fetchStats7d() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from("qa_runs")
    .select("status, started_at")
    .gte("started_at", sevenDaysAgo)
  const total = data?.length || 0
  const passed = data?.filter(r => r.status === "pass").length || 0
  const failed = data?.filter(r => r.status === "fail").length || 0
  const partial = data?.filter(r => r.status === "partial").length || 0
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
  return { total, passed, failed, partial, passRate }
}

async function fetchAvailableScenarios() {
  const files = await listScenarios()
  const out: Array<{ file: string; name: string; role: string; priority: string; steps_count: number }> = []
  for (const f of files) {
    const yaml = await readScenarioFile(f)
    if (!yaml) continue
    try {
      const parsed = parseScenario(yaml)
      out.push({
        file: f,
        name: parsed.name,
        role: parsed.role || "anonymous",
        priority: parsed.priority || "P2",
        steps_count: parsed.steps.length,
      })
    } catch {
      out.push({ file: f, name: f, role: "anonymous", priority: "P2", steps_count: 0 })
    }
  }
  return out
}

export default async function QaAdminPage() {
  const [runs, stats, scenarios] = await Promise.all([
    fetchRecentRuns(50),
    fetchStats7d(),
    fetchAvailableScenarios(),
  ])

  return (
    <main style={{ background: "#F7F4EF", minHeight: "100vh", padding: "32px 16px 96px", fontFamily: "'DM Sans', sans-serif", color: "#111" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: "#6b6358", margin: "0 0 8px", textTransform: "uppercase" }}>
            Admin · Interne
          </p>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 44, lineHeight: 1.1, margin: 0 }}>
            QA Bot
          </h1>
          <p style={{ fontSize: 14, color: "#5a5247", marginTop: 8, lineHeight: 1.5 }}>
            Tests autonomes du site lancés via Playwright headless.
            Voir <a href="/docs/QA_BOT.md" style={{ color: "#111", textDecoration: "underline", textUnderlineOffset: 2 }}>doc</a> pour ajouter un scénario.
          </p>
        </header>

        <QaAdminClient runs={runs} stats={stats} scenarios={scenarios} />
      </div>
    </main>
  )
}
