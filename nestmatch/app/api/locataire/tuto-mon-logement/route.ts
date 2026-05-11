/**
 * V95.C.1 — POST/DELETE /api/locataire/tuto-mon-logement
 *
 * POST   : pose `profils.tuto_mon_logement_at = now()` quand le locataire
 *          complete ou skip le tuto post-acceptance.
 * DELETE : reset le timestamp (pour "Refaire la visite guidée" dans menu user).
 * GET    : lit le statut courant (utilisé par /mon-logement pour décider si on
 *          affiche le tuto au mount).
 *
 * Auth : NextAuth session requise.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  const { data } = await supabaseAdmin
    .from("profils")
    .select("tuto_mon_logement_at")
    .eq("email", email)
    .maybeSingle()
  return NextResponse.json({
    ok: true,
    completed: !!data?.tuto_mon_logement_at,
    completed_at: data?.tuto_mon_logement_at || null,
  })
}

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  const { error } = await supabaseAdmin
    .from("profils")
    .update({ tuto_mon_logement_at: new Date().toISOString() })
    .eq("email", email)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  const { error } = await supabaseAdmin
    .from("profils")
    .update({ tuto_mon_logement_at: null })
    .eq("email", email)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, reset: true })
}
