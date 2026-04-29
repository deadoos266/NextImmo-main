/**
 * GET /api/profil/me — V29.B (Paul 2026-04-29)
 *
 * Retourne le profil complet de la session courante. Inclut dossier_docs
 * (CNI, fiches paie, etc.) car c'est l'owner qui lit son propre profil.
 *
 * Auth : NextAuth obligatoire. Sinon 401.
 *
 * Query optionnelle : ?cols=is_proprietaire,photo_url_custom pour limiter
 * les colonnes (perf — Navbar n'a besoin que de photo_url_custom).
 *
 * Remplace les ~17 sites client `supabase.from("profils").select(...)
 * .eq("email", session.user.email)` (V29 RLS Phase 5 — close SELECT anon).
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
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  // Optional cols filter (whitelist, anti-injection : juste un trim sur
  // chaque token + match regex column-name-safe)
  const colsParam = req.nextUrl.searchParams.get("cols") || ""
  const colSelector = (() => {
    if (!colsParam) return "*"
    const tokens = colsParam.split(",")
      .map(s => s.trim())
      .filter(s => /^[a-z_][a-z0-9_]*$/i.test(s))
      .slice(0, 50)
    return tokens.length > 0 ? tokens.join(", ") : "*"
  })()

  const { data, error } = await supabaseAdmin
    .from("profils")
    .select(colSelector)
    .eq("email", email)
    .maybeSingle()
  if (error) {
    console.error("[profil/me]", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, profil: data ?? null })
}
