/**
 * V65.1 — GET /api/messages/all-mine
 *
 * Retourne TOUS les messages où l'user connecté est expéditeur OU
 * destinataire. Utilisé par /messages pour construire la liste des
 * conversations (groupées côté client).
 *
 * Sécurité :
 *   - NextAuth requis. me = session.email strictement.
 *   - Le filter from_email = me OR to_email = me garantit qu'on ne renvoie
 *     que des messages où l'user est partie prenante.
 *
 * Préreq migration 058 (REVOKE SELECT anon sur messages).
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
    .from("messages")
    .select("*")
    .or(`from_email.eq.${me},to_email.eq.${me}`)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[messages/all-mine]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, messages: data ?? [] })
}
