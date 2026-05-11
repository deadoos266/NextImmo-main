/**
 * V83.3 — POST /api/qa/run
 *
 * Lance 1 ou plusieurs scénarios QA Bot.
 *
 * IMPORTANT — Architecture :
 * Vercel serverless ne peut PAS exécuter Playwright (binary Chromium 150MB
 * + no-headless required). Cette route NE LANCE PAS le runner.
 *
 * Modes possibles :
 *   A. POST avec `result` dans le body : insère un résultat pré-calculé
 *      (utilisé par GitHub Actions / runner local qui POST après run).
 *   B. POST avec `scenario` (lance) : crée juste une row 'running' que le
 *      runner externe doit ensuite mettre à jour via PATCH (V83.6).
 *
 * Pour V83 MVP, on accepte le mode A (POST result complet) qui est le
 * pattern le plus simple : un workflow GitHub Actions run Playwright,
 * POST les résultats ici, la DB stocke, l'admin lit /admin/qa.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  // Auth : admin OU CRON_SECRET (pour le GitHub Action ou autre external runner)
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  const isCron = cronSecret && auth === `Bearer ${cronSecret}`

  let triggered_by = "cron"
  let trigger: "manual" | "cron" | "api" = "cron"

  if (!isCron) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
    }
    triggered_by = session.user.email || "admin"
    trigger = "manual"
  }

  const body = await req.json().catch(() => ({}))

  // Mode A — POST result complet (pré-calculé par runner externe)
  if (body.result && typeof body.result === "object") {
    const r = body.result
    const { data, error } = await supabaseAdmin
      .from("qa_runs")
      .insert({
        scenario_name: r.scenario_name,
        scenario_file: r.scenario_file,
        status: r.status,
        started_at: r.started_at,
        finished_at: r.finished_at,
        duration_ms: r.duration_ms,
        steps_total: r.steps_total,
        steps_passed: r.steps_passed,
        steps_failed: r.steps_failed,
        screenshots: r.screenshots || [],
        errors: r.errors || [],
        network_log: r.network_log || null,
        console_log: r.console_log || null,
        trigger,
        triggered_by,
      })
      .select("id")
      .single()

    if (error) {
      console.error("[qa/run] insert failed:", error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, run_id: data.id })
  }

  // Mode B — déclencheur seul (run async côté external)
  if (body.scenario && typeof body.scenario === "string") {
    const { data, error } = await supabaseAdmin
      .from("qa_runs")
      .insert({
        scenario_name: body.scenario,
        scenario_file: body.scenario,
        status: "running",
        steps_total: 0,
        trigger,
        triggered_by,
      })
      .select("id")
      .single()
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      run_id: data.id,
      message: "Run pending — external runner must PATCH /api/qa/runs/[id] with result",
    })
  }

  return NextResponse.json({
    ok: false,
    error: "Body invalide. Attendu : { result: {...} } OU { scenario: 'name' }",
  }, { status: 400 })
}
