/**
 * V63 — GET /api/messages/unread-count
 *
 * Retourne le nombre de messages non lus pour l'user connecté (badge Navbar).
 *
 * Pourquoi server-side maintenant : prérequis migration 058 RLS Phase 5
 * final (REVOKE SELECT anon sur messages). Avant, le Navbar lisait via
 * supabase.from("messages") en client direct.
 *
 * Sécurité :
 * - NextAuth requis (anti-leak du compteur d'autres users).
 * - Pas de body, pas de paramètre — l'email vient strictement de la session.
 * - Pas de rate-limit : appelée 1× au mount + sur events Realtime, charge
 *   est limitée par les triggers in-app eux-mêmes (insert/update messages).
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const { count, error } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("to_email", email)
    .eq("lu", false)

  if (error) {
    console.error("[messages/unread-count]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: count ?? 0 })
}
