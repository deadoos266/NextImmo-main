/**
 * GET /api/notifications — Liste des 30 dernières notifs de l'user courant.
 *
 * Retourne { ok: true, notifs: [...], unreadCount: n }. Filtrage strict sur
 * session.user.email côté serveur — jamais de leak vers un autre user.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

const LIMIT = 30

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const [{ data, error }, { count }] = await Promise.all([
    supabaseAdmin
      .from("notifications")
      .select("id, type, title, body, href, related_id, lu, created_at")
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("lu", false),
  ])

  if (error) {
    console.error("[notifications GET]", error)
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    notifs: data ?? [],
    unreadCount: count ?? 0,
  })
}
