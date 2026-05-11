/**
 * V84.9 — GET / PATCH /api/admin/bugs/[id]
 *
 * GET : détail d'un bug avec console_log + network_log complets.
 * PATCH : update status / notes / severity. Admin auth.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_STATUS = ["open", "investigating", "fixed", "wontfix", "duplicate"]
const ALLOWED_SEVERITY = ["critical", "major", "minor", "cosmetic"]

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from("user_bug_reports")
    .select("*")
    .eq("id", id)
    .single()
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 404 })
  }
  return NextResponse.json({ ok: true, bug: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const update: Record<string, unknown> = {}
  if (typeof body.status === "string" && ALLOWED_STATUS.includes(body.status)) {
    update.status = body.status
    if (body.status === "fixed") {
      update.fixed_at = new Date().toISOString()
    }
  }
  if (typeof body.severity === "string" && ALLOWED_SEVERITY.includes(body.severity)) {
    update.severity = body.severity
  }
  if (typeof body.notes === "string") {
    update.notes = body.notes.slice(0, 2000)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun champ à mettre à jour" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("user_bug_reports")
    .update(update)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
