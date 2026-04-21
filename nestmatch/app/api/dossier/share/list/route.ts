import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * GET /api/dossier/share/list
 * Liste les liens de partage émis par le user connecté (actifs + expirés + révoqués),
 * triés du plus récent au plus ancien. Ne retourne JAMAIS le token brut ni son hash
 * (le hash sert à corréler avec les logs, pas à un usage UI).
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("dossier_share_tokens")
    .select("id, label, created_at, expires_at, revoked_at, consultation_count, last_consulted_at")
    .eq("email_locataire", email)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    // Migration 021 pas encore appliquée → graceful : liste vide
    if (error.code === "42P01") {
      return NextResponse.json({ success: true, tokens: [] })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tokens: data ?? [] })
}
