import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * V12 Étape B Phase 1 — chargement de threads admin.
 *
 * GET /api/admin/messages?a=email1&b=email2&annonceId=42
 *   Renvoie les messages échangés entre 2 utilisateurs (optionnellement
 *   filtré sur une annonce donnée), pour la fonctionnalité « Lire le
 *   thread » du dashboard admin.
 *
 * Auth : NextAuth + is_admin obligatoire.
 *
 * Avant V12 : /admin/page.tsx (ligne 151) faisait
 *   supabase.from("messages").select(...).or(`and(from_email.eq.${a}...)`)
 * directement. Un attaquant non-admin pouvait lire n'importe quelle conv.
 * Centralisé ici.
 */

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const a = (req.nextUrl.searchParams.get("a") || "").toLowerCase().trim()
  const b = (req.nextUrl.searchParams.get("b") || "").toLowerCase().trim()
  if (!a || !b) {
    return NextResponse.json({ success: false, error: "Paramètres a et b requis" }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b)) {
    return NextResponse.json({ success: false, error: "Emails invalides" }, { status: 400 })
  }
  const annonceIdRaw = req.nextUrl.searchParams.get("annonceId")
  const annonceId = annonceIdRaw ? Number(annonceIdRaw) : null
  if (annonceIdRaw && (!Number.isFinite(annonceId) || (annonceId as number) <= 0)) {
    return NextResponse.json({ success: false, error: "annonceId invalide" }, { status: 400 })
  }

  let query = supabaseAdmin
    .from("messages")
    .select("*")
    .or(`and(from_email.eq.${a},to_email.eq.${b}),and(from_email.eq.${b},to_email.eq.${a})`)
    .order("created_at", { ascending: true })
  if (annonceId) query = query.eq("annonce_id", annonceId)

  const { data, error } = await query
  if (error) {
    console.error("[/api/admin/messages GET]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ success: true, messages: data ?? [] })
}
