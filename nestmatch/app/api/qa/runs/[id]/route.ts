/**
 * V83.3 — GET /api/qa/runs/[id] + PATCH /api/qa/runs/[id]
 *
 * GET : retourne un run complet avec screenshots URLs, errors, network_log,
 *       console_log. Auth admin.
 *
 * PATCH : utilisé par un runner externe pour mettre à jour le résultat
 *         d'un run préalablement créé avec status='running'. Auth via
 *         CRON_SECRET Bearer (le runner externe n'est pas admin).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from("qa_runs")
    .select("*")
    .eq("id", id)
    .single()
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 404 })
  }
  return NextResponse.json({ ok: true, run: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Update les champs autorisés depuis un runner externe
  const update: Record<string, unknown> = {}
  for (const k of [
    "status", "finished_at", "duration_ms",
    "steps_total", "steps_passed", "steps_failed",
    "screenshots", "errors", "network_log", "console_log",
  ]) {
    if (k in body) update[k] = body[k]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun champ à mettre à jour" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("qa_runs")
    .update(update)
    .eq("id", id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
