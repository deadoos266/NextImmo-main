/**
 * V83.3 — GET /api/qa/runs?limit=50&status=fail&scenario=xxx
 *
 * Liste les derniers runs QA Bot, ordre desc started_at.
 * Auth admin strict.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200)
  const status = url.searchParams.get("status")
  const scenario = url.searchParams.get("scenario")

  let q = supabaseAdmin
    .from("qa_runs")
    .select("id, scenario_name, scenario_file, status, started_at, finished_at, duration_ms, steps_total, steps_passed, steps_failed, trigger, triggered_by")
    .order("started_at", { ascending: false })
    .limit(limit)

  if (status) q = q.eq("status", status)
  if (scenario) q = q.eq("scenario_name", scenario)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Stats agrégées 7j
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: stats7d } = await supabaseAdmin
    .from("qa_runs")
    .select("status")
    .gte("started_at", sevenDaysAgo)

  const totalRuns7d = stats7d?.length || 0
  const passRuns7d = stats7d?.filter(r => r.status === "pass").length || 0
  const failRuns7d = stats7d?.filter(r => r.status === "fail").length || 0
  const passRate7d = totalRuns7d > 0 ? Math.round((passRuns7d / totalRuns7d) * 100) : 0

  return NextResponse.json({
    ok: true,
    runs: data || [],
    stats: {
      total_7d: totalRuns7d,
      pass_7d: passRuns7d,
      fail_7d: failRuns7d,
      pass_rate_pct_7d: passRate7d,
    },
  })
}
