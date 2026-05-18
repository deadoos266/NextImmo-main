/**
 * V97.39.34 — GET /api/agences/mine
 *
 * Retourne la liste des agences dont l'utilisateur loggué est membre actif
 * (joined_at non null, removed_at null). Utilisé par le wizard d'ajout
 * d'annonce pour proposer "publier au nom de [agence]" et par le menu user.
 *
 * Auth : session NextAuth requise.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const email = session.user.email.toLowerCase()

  // Récupère les agence_id de l'user, puis fetch les agences
  const { data: membres, error: memErr } = await supabaseAdmin
    .from("agence_membres")
    .select("agence_id, role")
    .eq("user_email", email)
    .is("removed_at", null)
    .not("joined_at", "is", null)

  if (memErr) {
    return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 })
  }

  if (!membres || membres.length === 0) {
    return NextResponse.json({ ok: true, agences: [] })
  }

  const agenceIds = membres.map(m => m.agence_id)
  const { data: agences, error: agErr } = await supabaseAdmin
    .from("agences")
    .select("id, slug, name, statut, logo_url, ville")
    .in("id", agenceIds)

  if (agErr) {
    return NextResponse.json({ ok: false, error: agErr.message }, { status: 500 })
  }

  // Fusionne role + agence
  const enriched = (agences || []).map(a => {
    const m = membres.find(mm => mm.agence_id === a.id)
    return { ...a, role: m?.role || "viewer" }
  })

  return NextResponse.json({ ok: true, agences: enriched })
}
