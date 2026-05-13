/**
 * V97.36 P3-7 — GET /api/admin/imports
 *
 * Stats des imports URL annonce pour le dashboard /admin/imports.
 * Renvoie :
 *  - Totaux 24h / 7j / 30j
 *  - Taux de succès par source sur 7j (pour alerter si parser dégradé)
 *  - 50 derniers imports (table récente)
 *
 * Auth : admin requis.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ImportLog {
  id: string
  user_email: string | null
  source: string | null
  source_url: string | null
  status: "success" | "fail" | "partial"
  fields_extracted: number | null
  fields_total: number | null
  duration_ms: number | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!session || !(session as any).user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const now = Date.now()
  const day24 = new Date(now - 24 * 3600 * 1000).toISOString()
  const day7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString()
  const day30 = new Date(now - 30 * 24 * 3600 * 1000).toISOString()

  const [total24, total7, total30, last50, by7d] = await Promise.all([
    supabaseAdmin.from("import_logs").select("status", { count: "exact" }).gte("created_at", day24),
    supabaseAdmin.from("import_logs").select("status", { count: "exact" }).gte("created_at", day7),
    supabaseAdmin.from("import_logs").select("status", { count: "exact" }).gte("created_at", day30),
    supabaseAdmin.from("import_logs").select("*").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("import_logs").select("source, status").gte("created_at", day7),
  ])

  // Stats par source (7j)
  const sourceStats: Record<string, { success: number; partial: number; fail: number; total: number; rate_success: number }> = {}
  for (const row of (by7d.data || []) as Array<{ source: string | null; status: string }>) {
    const src = row.source || "unknown"
    if (!sourceStats[src]) sourceStats[src] = { success: 0, partial: 0, fail: 0, total: 0, rate_success: 0 }
    sourceStats[src].total++
    if (row.status === "success") sourceStats[src].success++
    else if (row.status === "partial") sourceStats[src].partial++
    else if (row.status === "fail") sourceStats[src].fail++
  }
  for (const src of Object.keys(sourceStats)) {
    const s = sourceStats[src]
    s.rate_success = s.total > 0 ? Math.round(((s.success + s.partial) / s.total) * 100) : 0
  }

  // Alertes : parsers avec >50% fail sur 7j ET >=10 imports
  const alerts: string[] = []
  for (const [src, s] of Object.entries(sourceStats)) {
    if (s.total >= 10 && s.fail / s.total > 0.5) {
      alerts.push(`Parser "${src}" : ${s.fail}/${s.total} échecs (${Math.round((s.fail / s.total) * 100)}%) — site source a peut-être changé son markup.`)
    }
  }

  return NextResponse.json({
    ok: true,
    totals: {
      day_24h: total24.count || 0,
      day_7d: total7.count || 0,
      day_30d: total30.count || 0,
    },
    source_stats_7d: sourceStats,
    alerts,
    recent_imports: (last50.data || []) as ImportLog[],
  })
}
