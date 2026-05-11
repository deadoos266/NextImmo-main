/**
 * V84.9 — GET /api/admin/bugs
 *
 * Liste paginée + filtrée des user_bug_reports. Auth admin strict.
 *
 * Query :
 *   ?limit=50&status=open&severity=major&q=texte
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
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500)
  const status = url.searchParams.get("status")
  const severity = url.searchParams.get("severity")
  const q = url.searchParams.get("q")

  let query = supabaseAdmin
    .from("user_bug_reports")
    .select("id, user_email, user_role, page_url, user_agent, description, severity, status, screenshot_url, notes, fixed_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status) query = query.eq("status", status)
  if (severity) query = query.eq("severity", severity)
  if (q) query = query.ilike("description", `%${q}%`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // V97.10 — Resolve signed URLs pour les screenshots stockés en bucket privé.
  // Format stocké : "storage://bug-screenshots/<filename>". Signed URL valide 1h.
  const STORAGE_PREFIX = "storage://bug-screenshots/"
  const bugsWithSignedUrls = await Promise.all((data || []).map(async b => {
    if (!b.screenshot_url || !b.screenshot_url.startsWith(STORAGE_PREFIX)) return b
    const path = b.screenshot_url.slice(STORAGE_PREFIX.length)
    const { data: signed } = await supabaseAdmin.storage.from("bug-screenshots").createSignedUrl(path, 3600)
    return { ...b, screenshot_url: signed?.signedUrl || null }
  }))

  // Stats agrégées
  const { data: stats } = await supabaseAdmin
    .from("user_bug_reports")
    .select("severity, status")

  const bySeverity: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const b of stats || []) {
    bySeverity[b.severity] = (bySeverity[b.severity] || 0) + 1
    byStatus[b.status] = (byStatus[b.status] || 0) + 1
  }

  return NextResponse.json({
    ok: true,
    bugs: bugsWithSignedUrls,
    stats: { by_severity: bySeverity, by_status: byStatus, total: stats?.length || 0 },
  })
}
