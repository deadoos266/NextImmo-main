/**
 * V84.8 — POST /api/bugs/report
 *
 * Endpoint public (authenticated requis) pour reporter un bug depuis le
 * widget BugReportButton flottant sur le site.
 *
 * Body : {
 *   description: string (required)
 *   severity: 'critical' | 'major' | 'minor' | 'cosmetic'
 *   page_url: string
 *   user_agent?: string
 *   console_log?: array
 *   network_log?: array
 *   screenshot_url?: string
 * }
 *
 * Validation côté serveur + INSERT user_bug_reports.
 * Email auto Paul si severity critical/major (V85+).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_SEVERITIES = ["critical", "major", "minor", "cosmetic"] as const

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const description = typeof body.description === "string" ? body.description.trim() : ""
  const severity = typeof body.severity === "string" && (ALLOWED_SEVERITIES as readonly string[]).includes(body.severity)
    ? body.severity : "minor"
  const page_url = typeof body.page_url === "string" ? body.page_url.slice(0, 500) : ""
  const user_agent = typeof body.user_agent === "string" ? body.user_agent.slice(0, 300) : null
  const console_log = Array.isArray(body.console_log) ? body.console_log.slice(0, 50) : null
  const network_log = Array.isArray(body.network_log) ? body.network_log.slice(0, 20) : null
  const screenshot_url = typeof body.screenshot_url === "string" ? body.screenshot_url.slice(0, 500) : null

  if (description.length < 5) {
    return NextResponse.json({ ok: false, error: "Description trop courte (min 5 caractères)" }, { status: 400 })
  }
  if (!page_url) {
    return NextResponse.json({ ok: false, error: "page_url requis" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("user_bug_reports")
    .insert({
      user_email: session.user.email,
      user_role: session.user.role || null,
      page_url,
      user_agent,
      description: description.slice(0, 2000),
      severity,
      status: "open",
      screenshot_url,
      console_log,
      network_log,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[bugs/report] insert failed:", error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
