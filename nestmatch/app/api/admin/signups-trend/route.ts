/**
 * V97.29 P3-5.B.2 — GET /api/admin/signups-trend
 *
 * Retourne les inscriptions des 30 derniers jours, bucketisées par jour.
 * Pour chaque jour : date (YYYY-MM-DD), count, jour de la semaine.
 *
 * Source : users.created_at (table principale d'inscription NextAuth).
 * Période : derniers 30 jours, fuseau Europe/Paris.
 *
 * Réponse :
 *   { ok: true, days: [{ date, count, dow }] (30 entries), total, peak }
 *
 * Auth : admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DAYS_WINDOW = 30
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const since = new Date(Date.now() - DAYS_WINDOW * DAY_MS).toISOString()
  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("created_at")
    .gte("created_at", since)
    .limit(10000)

  if (error) {
    console.error("[admin/signups-trend]", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Buckets : 30 entrées, du plus ancien au plus récent
  const now = new Date()
  // Aligne sur minuit local pour avoir des buckets "jours pleins"
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const buckets: Array<{ date: string; count: number; dow: number; ts: number }> = []
  for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
    const d = new Date(todayMidnight.getTime() - i * DAY_MS)
    buckets.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      count: 0,
      dow: d.getDay(),  // 0=dimanche, 1=lundi, etc.
      ts: d.getTime(),
    })
  }

  for (const u of users || []) {
    const t = u.created_at ? new Date(u.created_at).getTime() : 0
    if (!t) continue
    // Trouve le bucket : (t - todayMidnight) en jours
    const diffDays = Math.floor((todayMidnight.getTime() - new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime()) / DAY_MS)
    if (diffDays < 0 || diffDays >= DAYS_WINDOW) continue
    const idx = DAYS_WINDOW - 1 - diffDays
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx].count += 1
    }
  }

  const total = buckets.reduce((s, b) => s + b.count, 0)
  const peak = buckets.reduce((m, b) => b.count > m ? b.count : m, 0)
  const avg = Math.round((total / DAYS_WINDOW) * 10) / 10

  return NextResponse.json({
    ok: true,
    window_days: DAYS_WINDOW,
    days: buckets.map(({ ts, ...rest }) => { void ts; return rest }),
    total,
    peak,
    avg_per_day: avg,
  })
}
