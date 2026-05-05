/**
 * V65.1 — GET /api/proprietaire/stats/messages-counts?annonce_id=X
 *
 * Retourne 2 counts utilisés par le funnel /proprietaire/stats :
 *   - candidatures : nb de messages avec type='candidature' reçus pour cette annonce
 *   - dossiers : nb de messages [DOSSIER_CARD] reçus
 *
 * Sécurité :
 *   - NextAuth requis.
 *   - Scope : appelant doit être le propriétaire de l'annonce.
 *
 * Préreq migration 058 (REVOKE SELECT anon sur messages).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const annonceId = Number(req.nextUrl.searchParams.get("annonce_id"))
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
  }

  // Scope : appelant = proprio de l'annonce
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  if ((ann.proprietaire_email || "").toLowerCase() !== email) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  const [{ count: candidatures }, { count: dossiers }] = await Promise.all([
    supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("to_email", email)
      .eq("annonce_id", annonceId)
      .eq("type", "candidature"),
    supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("to_email", email)
      .eq("annonce_id", annonceId)
      .like("contenu", "[DOSSIER_CARD]%"),
  ])

  return NextResponse.json({
    ok: true,
    candidatures: candidatures ?? 0,
    dossiers: dossiers ?? 0,
  })
}
