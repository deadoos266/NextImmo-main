/**
 * V65.2 — GET /api/edl/has-mine
 *
 * Retourne { ok, hasEdl: boolean } indiquant si l'user connecté a au moins
 * un EDL en tant que locataire. Utilisé par /mes-documents pour afficher
 * la card "État des lieux disponible".
 *
 * Sécurité : NextAuth requis. me = session strictement.
 *
 * Préreq migration 059 (REVOKE SELECT anon sur etats_des_lieux).
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("id")
    .eq("locataire_email", me)
    .limit(1)

  if (error) {
    console.error("[edl/has-mine]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, hasEdl: (data ?? []).length > 0 })
}
