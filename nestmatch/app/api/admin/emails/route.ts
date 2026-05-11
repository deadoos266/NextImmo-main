/**
 * V87.4 — GET /api/admin/emails
 *
 * Stats agrégées + liste des emails récents. Auth admin strict.
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
  const template = url.searchParams.get("template")
  const q = url.searchParams.get("q")

  let query = supabaseAdmin
    .from("email_logs")
    .select("id, resend_id, to_email, from_email, subject, template_name, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at, bounce_type, error_message")
    .order("sent_at", { ascending: false })
    .limit(limit)

  if (status) query = query.eq("status", status)
  if (template) query = query.eq("template_name", template)
  if (q) query = query.ilike("subject", `%${q}%`)

  const { data: logs, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Stats agrégées
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: all7d } = await supabaseAdmin
    .from("email_logs")
    .select("status, template_name")
    .gte("sent_at", since7d)
    .limit(5000)

  const byStatus: Record<string, number> = {}
  const byTemplate: Record<string, number> = {}
  for (const l of all7d || []) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1
    if (l.template_name) byTemplate[l.template_name] = (byTemplate[l.template_name] || 0) + 1
  }
  const total7d = all7d?.length || 0
  const delivered7d = byStatus.delivered || 0
  const bounced7d = byStatus.bounced || 0
  const complained7d = byStatus.complained || 0
  const opened7d = byStatus.opened || 0
  const deliveryRate = total7d > 0 ? Math.round(((delivered7d + opened7d + (byStatus.clicked || 0)) / total7d) * 100) : 0
  const bounceRate = total7d > 0 ? Math.round((bounced7d / total7d) * 100) : 0
  const openRate = (delivered7d + opened7d) > 0 ? Math.round((opened7d / (delivered7d + opened7d)) * 100) : 0

  // Suppress list count
  const { count: suppressCount } = await supabaseAdmin
    .from("email_suppress_list")
    .select("email", { count: "exact", head: true })
    .is("removed_at", null)

  return NextResponse.json({
    ok: true,
    logs: logs || [],
    stats: {
      total_7d: total7d,
      by_status: byStatus,
      by_template: byTemplate,
      delivery_rate_pct: deliveryRate,
      bounce_rate_pct: bounceRate,
      open_rate_pct: openRate,
      suppress_count: suppressCount || 0,
    },
  })
}
