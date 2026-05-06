/**
 * V71.4 — POST /api/admin/incidents/[id]/resolve
 *
 * Marque un incident comme résolu : status='resolved' + resolved_at=now().
 * Utilisé par /admin/health pour clôturer manuellement un incident.
 *
 * Auth : admin only.
 * Param : `id` (uuid de l'incident).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Next 15 — params est désormais une Promise.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const { id } = await ctx.params
  if (!id || typeof id !== "string") {
    return NextResponse.json({ success: false, error: "id manquant" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from("incidents")
    .update({ status: "resolved", resolved_at: now, updated_at: now })
    .eq("id", id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
