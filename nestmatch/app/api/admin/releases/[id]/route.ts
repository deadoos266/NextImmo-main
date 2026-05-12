/**
 * V97.24 batch 2 — PATCH /api/admin/releases/[id]
 *
 * Update le status global d'une release :
 *  - { action: "validate_all" } : marque tous les checks pending → ok, status → validated
 *  - { action: "reset" } : remet tous les checks à pending, status → pending
 *  - { blocker_description: string } : note de blocage global
 *
 * Auth : admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface CheckItem {
  id: string
  label: string
  status?: "pending" | "ok" | "blocked"
  note?: string | null
  screenshot_path?: string | null
}

interface PatchBody {
  action?: "validate_all" | "reset"
  blocker_description?: string | null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ ok: false, error: "id manquant" }, { status: 400 })
  }

  let body: PatchBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const { data: release, error: getErr } = await supabaseAdmin
    .from("release_validations")
    .select("id, checks")
    .eq("id", id)
    .maybeSingle()
  if (getErr || !release) {
    return NextResponse.json({ ok: false, error: "Release introuvable" }, { status: 404 })
  }

  const checks: CheckItem[] = Array.isArray(release.checks) ? release.checks : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = {}

  if (body.action === "validate_all") {
    // Marque TOUS les checks pending comme ok (les blocked restent blocked
    // pour ne pas effacer un signalement par mégarde)
    const newChecks = checks.map(c => c.status === "blocked" ? c : { ...c, status: "ok" as const })
    const allOk = newChecks.every(c => c.status === "ok")
    updatePayload.checks = newChecks
    updatePayload.status = allOk ? "validated" : "blocked"
    if (allOk) {
      updatePayload.validated_at = new Date().toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updatePayload.validated_by = (session as any).user?.email || null
    }
  } else if (body.action === "reset") {
    updatePayload.checks = checks.map(c => ({ ...c, status: "pending" as const, note: null, screenshot_path: null }))
    updatePayload.status = "pending"
    updatePayload.validated_at = null
    updatePayload.validated_by = null
    updatePayload.blocker_description = null
  }

  if (typeof body.blocker_description === "string") {
    updatePayload.blocker_description = body.blocker_description.slice(0, 1000) || null
  } else if (body.blocker_description === null) {
    updatePayload.blocker_description = null
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ ok: false, error: "Aucune action fournie" }, { status: 400 })
  }

  const { error: updErr } = await supabaseAdmin
    .from("release_validations")
    .update(updatePayload)
    .eq("id", id)
  if (updErr) {
    console.error("[admin/releases PATCH]", updErr)
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...updatePayload })
}
