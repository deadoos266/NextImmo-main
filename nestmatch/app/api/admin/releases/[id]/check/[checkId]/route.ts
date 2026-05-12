/**
 * V97.24 batch 2 — PATCH /api/admin/releases/[id]/check/[checkId]
 *
 * Update un check individuel dans la checks jsonb d'une release_validation.
 * Body : { status: "ok"|"blocked"|"pending", note?: string, screenshot_path?: string }
 *
 * Recalcule aussi le status global de la release :
 *  - Tous "ok"          → "validated"
 *  - Au moins un "blocked" → "blocked"
 *  - Mix ok/pending     → "in_progress"
 *  - Tous "pending"     → "pending"
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
  // V97.32 — `coded` = fait par Claude, en attente test Paul.
  // `ok` = testé et validé par Paul. `blocked` = bug trouvé par Paul.
  status?: "pending" | "coded" | "ok" | "blocked"
  note?: string | null
  screenshot_path?: string | null
}

interface PatchBody {
  status?: "ok" | "blocked" | "pending" | "coded"
  note?: string | null
  screenshot_path?: string | null
}

function computeReleaseStatus(checks: CheckItem[]): "pending" | "in_progress" | "validated" | "blocked" {
  if (checks.length === 0) return "pending"
  const hasBlocked = checks.some(c => c.status === "blocked")
  if (hasBlocked) return "blocked"
  const allOk = checks.every(c => c.status === "ok")
  if (allOk) return "validated"
  // V97.32 — Au moins un check `ok` OU `coded` (= avancement, pas validation
  // complète) déclenche `in_progress`. Le release reste pending tant qu'aucun
  // check n'a bougé.
  const anyAdvancement = checks.some(c => c.status === "ok" || c.status === "coded")
  if (anyAdvancement) return "in_progress"
  return "pending"
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; checkId: string }> },
) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const { id, checkId } = await params
  if (!id || !checkId) {
    return NextResponse.json({ ok: false, error: "id / checkId manquant" }, { status: 400 })
  }

  let body: PatchBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const newStatus = body.status
  if (newStatus && !["ok", "blocked", "pending", "coded"].includes(newStatus)) {
    return NextResponse.json({ ok: false, error: "status invalide" }, { status: 400 })
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null
  const screenshotPath = typeof body.screenshot_path === "string" ? body.screenshot_path.slice(0, 300) : null

  // Récupère la release
  const { data: release, error: getErr } = await supabaseAdmin
    .from("release_validations")
    .select("id, checks")
    .eq("id", id)
    .maybeSingle()
  if (getErr || !release) {
    return NextResponse.json({ ok: false, error: "Release introuvable" }, { status: 404 })
  }

  const checks: CheckItem[] = Array.isArray(release.checks) ? release.checks : []
  const idx = checks.findIndex(c => c.id === checkId)
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "Check introuvable" }, { status: 404 })
  }

  // Update du check
  const updated: CheckItem = { ...checks[idx] }
  if (newStatus) updated.status = newStatus
  // note et screenshot peuvent être explicitement reset à null (clear)
  if ("note" in body) updated.note = note
  if ("screenshot_path" in body) updated.screenshot_path = screenshotPath
  checks[idx] = updated

  const newReleaseStatus = computeReleaseStatus(checks)
  const validatedAt = newReleaseStatus === "validated" ? new Date().toISOString() : null

  const { error: updErr } = await supabaseAdmin
    .from("release_validations")
    .update({
      checks,
      status: newReleaseStatus,
      validated_at: validatedAt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validated_by: newReleaseStatus === "validated" ? (session as any).user?.email || null : null,
    })
    .eq("id", id)
  if (updErr) {
    console.error("[admin/releases/check PATCH]", updErr)
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: newReleaseStatus, checks })
}
