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

// V81.29 — Regex email RFC-like pour valider que `me` ne contient pas
// caractères qui casseraient la string interpolée dans .or() (virgule,
// parenthèses). Audit security review V81.x : risque très faible car
// l'email vient de NextAuth (validé Google/Credentials), mais defense
// in depth contre une corruption future de session ou un bypass.
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export async function GET() {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  if (!EMAIL_REGEX.test(me)) {
    console.error("[messages/all-mine] email format invalide:", me)
    return NextResponse.json({ ok: false, error: "Auth invalide" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .or(`from_email.eq.${me},to_email.eq.${me}`)
    .is("deleted_at", null)  // V97.26 T1 — exclut soft-deleted
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[messages/all-mine]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, messages: data ?? [] })
}
