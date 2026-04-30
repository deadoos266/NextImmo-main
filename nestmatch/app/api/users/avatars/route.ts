/**
 * V55.1 — POST /api/users/avatars
 *
 * Retourne les avatars Google OAuth (users.image) pour une liste d'emails.
 * Utilisé dans /messages comme fallback quand profils.photo_url_custom
 * n'est pas défini (un user qui a connecté via Google sans uploader d'avatar
 * custom voit son image Google).
 *
 * Body : { emails: string[] }
 * Auth : NextAuth obligatoire.
 *
 * V55.1 RLS Phase 5 final : la table `users` est REVOKE SELECT anon. Cette
 * route le proxy server-side pour les besoins UI légitimes.
 *
 * Réponse : { ok: true, avatars: { [email]: imageUrl } }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

interface Body {
  emails: string[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  const emails = Array.isArray(body.emails)
    ? body.emails
        .filter((e): e is string => typeof e === "string")
        .map(e => e.trim().toLowerCase())
        .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        .slice(0, 200)
    : []
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, avatars: {} })
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("email, image")
    .in("email", emails)
  if (error) {
    console.error("[users/avatars]", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  const avatars: Record<string, string> = {}
  for (const u of (data || [])) {
    const e = (u as { email?: string | null }).email?.toLowerCase()
    const img = (u as { image?: string | null }).image
    if (e && img) avatars[e] = img
  }

  return NextResponse.json({ ok: true, avatars })
}
