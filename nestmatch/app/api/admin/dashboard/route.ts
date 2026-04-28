import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * GET /api/admin/dashboard — V12 Étape B Phase 1.
 *
 * Charge en parallèle les datasets bruts pour /admin :
 *  - annonces (toutes, ordre id desc)
 *  - profils (tous — contient dossier_docs sensible)
 *  - users (id, email, name, role, is_admin, is_banned, ban_reason, email_verified, created_at)
 *  - messages (les 100 derniers)
 *
 * Auth : NextAuth session + flag is_admin obligatoire. Sinon 403.
 *
 * Avant V12 : ces 4 SELECT étaient faits côté client avec la clé anon
 * dans /admin/page.tsx (lignes 124-128). Un attaquant non-admin avec la
 * clé anon (publique dans le bundle JS) pouvait dumper tous les profils
 * (CNI, fiches paie, revenus, garants). C'est corrigé en migrant la lecture
 * vers cette route server-side avec supabaseAdmin (qui ignore la RLS).
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const [annoncesRes, profilsRes, usersRes, messagesRes] = await Promise.all([
    supabaseAdmin.from("annonces").select("*").order("id", { ascending: false }),
    supabaseAdmin.from("profils").select("*"),
    supabaseAdmin
      .from("users")
      .select("id, email, name, role, is_admin, is_banned, ban_reason, email_verified, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  if (annoncesRes.error || profilsRes.error || usersRes.error || messagesRes.error) {
    console.error("[/api/admin/dashboard]", {
      annonces: annoncesRes.error,
      profils: profilsRes.error,
      users: usersRes.error,
      messages: messagesRes.error,
    })
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    annonces: annoncesRes.data ?? [],
    profils: profilsRes.data ?? [],
    users: usersRes.data ?? [],
    messages: messagesRes.data ?? [],
  })
}
