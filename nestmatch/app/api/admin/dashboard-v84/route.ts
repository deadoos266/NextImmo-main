/**
 * V84.6 — GET /api/admin/dashboard-v84
 *
 * Stats agrégées pour les widgets du nouveau dashboard /admin.
 * Auth admin strict.
 *
 * Retourne :
 *  - health : statut global services
 *  - incidents : count par sévérité non résolus
 *  - qa : pass rate 7j + last run
 *  - users : total / 24h
 *  - annonces : total / 24h
 *  - baux : actifs / signés mois courant
 *  - bugs : count par sévérité
 *  - crons : 24h success / failure
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const since7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Lance toutes les queries en parallèle pour réduire la latence
  const [
    usersTotal, usersNew24h,
    annoncesTotal, annoncesNew24h,
    bauxActifs, bauxSignedMonth,
    incidents, qa7d, bugs, crons24h,
  ] = await Promise.all([
    supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("id", { count: "exact", head: true }).gte("created_at", since24h),

    supabaseAdmin.from("annonces").select("id", { count: "exact", head: true }).eq("is_test", false),
    supabaseAdmin.from("annonces").select("id", { count: "exact", head: true }).eq("is_test", false).gte("created_at", since24h),

    supabaseAdmin.from("baux").select("id", { count: "exact", head: true }).eq("statut", "actif"),
    supabaseAdmin.from("baux").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),

    supabaseAdmin.from("incidents").select("severity, status").eq("status", "open"),
    supabaseAdmin.from("qa_runs").select("status, started_at").gte("started_at", since7d),
    supabaseAdmin.from("user_bug_reports").select("severity, status").eq("status", "open"),
    supabaseAdmin.from("cron_logs").select("status").gte("started_at", since24h),
  ])

  // Agréger
  const incidentsBySeverity: Record<string, number> = {}
  for (const inc of (incidents.data as Array<{ severity: string }> | null) || []) {
    incidentsBySeverity[inc.severity] = (incidentsBySeverity[inc.severity] || 0) + 1
  }

  const qaTotal = qa7d.data?.length || 0
  const qaPassed = qa7d.data?.filter(r => r.status === "pass").length || 0
  const qaPassRate = qaTotal > 0 ? Math.round((qaPassed / qaTotal) * 100) : 0

  const bugsBySeverity: Record<string, number> = {}
  for (const b of (bugs.data as Array<{ severity: string }> | null) || []) {
    bugsBySeverity[b.severity] = (bugsBySeverity[b.severity] || 0) + 1
  }

  const cronsTotal = crons24h.data?.length || 0
  const cronsSuccess = crons24h.data?.filter(c => c.status === "success").length || 0
  const cronsFailure = crons24h.data?.filter(c => c.status === "failure" || c.status === "timeout").length || 0

  return NextResponse.json({
    ok: true,
    stats: {
      users: { total: usersTotal.count || 0, new_24h: usersNew24h.count || 0 },
      annonces: { total: annoncesTotal.count || 0, new_24h: annoncesNew24h.count || 0 },
      baux: { actifs: bauxActifs.count || 0, signed_month: bauxSignedMonth.count || 0 },
      incidents: {
        total: (incidents.data?.length) || 0,
        by_severity: incidentsBySeverity,
      },
      qa: { runs_7d: qaTotal, pass_rate_pct: qaPassRate, passed_7d: qaPassed },
      bugs: {
        open_total: (bugs.data?.length) || 0,
        by_severity: bugsBySeverity,
      },
      crons: { runs_24h: cronsTotal, success: cronsSuccess, failure: cronsFailure },
    },
  })
}
