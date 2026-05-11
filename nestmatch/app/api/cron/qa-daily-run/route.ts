/**
 * V83.6 — POST /api/cron/qa-daily-run
 *
 * Cron daily qui DÉCLENCHE le QA Bot. Schedule prévu : `0 4 * * *` (4h matin).
 *
 * Architecture (V83 MVP) :
 *  - Cette route ne fait PAS tourner Playwright (incompatible Vercel
 *    serverless 150MB chromium).
 *  - Elle crée une row qa_runs status='running' pour chaque scénario du
 *    dossier qa/scenarios/.
 *  - Un GitHub Action / serveur externe poll /api/qa/runs?status=running
 *    et exécute les runs avec Playwright local, puis PATCH le résultat.
 *
 * Alternatif futur : utiliser @sparticuz/chromium + playwright-core
 * pour pouvoir run dans la lambda Vercel (~50MB). À évaluer V84+.
 *
 * Si X scénarios fails de suite → INSERT incident V71 + email auto.
 *
 * Auth : Bearer CRON_SECRET.
 *
 * NOTE : pas encore ajouté au vercel.json (Hobby 2 crons max). Ajouter
 * post-upgrade Pro : cf docs/VERCEL_PRO_CRONS_PLAN.md.
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"
import { listScenarios, readScenarioFile } from "@/lib/qa/storage"
import { parseScenario } from "@/lib/qa/parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withCronLogging("qa-daily-run", null, async function cronGET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (process.env.NODE_ENV === "production" && (!cronSecret || auth !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const t0 = Date.now()
  const files = await listScenarios()
  const created: Array<{ run_id: string; scenario: string }> = []
  const errors: Array<{ scenario: string; error: string }> = []

  for (const f of files) {
    const yaml = await readScenarioFile(f)
    if (!yaml) continue
    try {
      const parsed = parseScenario(yaml)
      const { data, error } = await supabaseAdmin
        .from("qa_runs")
        .insert({
          scenario_name: parsed.name,
          scenario_file: f,
          status: "running",
          steps_total: parsed.steps.length,
          trigger: "cron",
          triggered_by: "cron",
        })
        .select("id")
        .single()
      if (error) {
        errors.push({ scenario: f, error: error.message })
        continue
      }
      created.push({ run_id: data.id, scenario: f })
    } catch (e) {
      errors.push({ scenario: f, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Détection de fails enchaînés (sur les 24h précédentes)
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: recent } = await supabaseAdmin
    .from("qa_runs")
    .select("status")
    .gte("started_at", since24h)
    .order("started_at", { ascending: false })
    .limit(10)

  const allFailed = recent && recent.length >= 5 && recent.every(r => r.status === "fail")
  if (allFailed) {
    // Insert incident V71
    try {
      await supabaseAdmin
        .from("incidents")
        .insert({
          title: "QA Bot — fails consécutifs détectés",
          description: `${recent.length} runs consécutifs en échec sur les dernières 24h. Vérifier /admin/qa pour les détails.`,
          severity: "warning",
          service: "app",
          scope: "internal",
          status: "open",
        })
        .select("id")
        .single()
    } catch (e) {
      console.warn("[qa-daily-run] insert incident failed:", e)
    }
  }

  return NextResponse.json({
    ok: true,
    scenarios_count: files.length,
    runs_created: created.length,
    errors,
    duration_ms: Date.now() - t0,
    note: "Runs en status='running'. Un runner externe doit exécuter Playwright et PATCH les résultats via /api/qa/runs/[id].",
  })
})
