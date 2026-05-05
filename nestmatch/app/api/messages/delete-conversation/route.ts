/**
 * V65.1 — POST /api/messages/delete-conversation
 *
 * Supprime tous les messages échangés entre l'user connecté et `with`
 * (optionnellement filtrés par annonce_id ou null).
 *
 * Body : { with: string, annonceId: number | null }
 *
 * Sécurité :
 *   - NextAuth requis. me = session strictement.
 *   - Le filter from_email = me OR to_email = me garantit qu'on supprime
 *     uniquement des messages où l'user est partie prenante.
 *
 * Préreq migration 058 (REVOKE DELETE anon sur messages).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

interface Body {
  with?: string
  annonceId?: number | string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const withEmail = typeof body.with === "string" ? body.with.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(withEmail)) {
    return NextResponse.json({ ok: false, error: "with invalide" }, { status: 400 })
  }

  // Build query : delete messages between me and withEmail, dans les 2 sens
  let query = supabaseAdmin
    .from("messages")
    .delete()
    .or(`and(from_email.eq.${me},to_email.eq.${withEmail}),and(from_email.eq.${withEmail},to_email.eq.${me})`)

  // Scope par annonce_id (specific number, "null" string, ou absent = no filter)
  if (body.annonceId === null) {
    query = query.is("annonce_id", null)
  } else if (body.annonceId !== undefined) {
    const n = Number(body.annonceId)
    if (Number.isFinite(n) && n > 0) {
      query = query.eq("annonce_id", n)
    }
  }

  const { error } = await query
  if (error) {
    console.error("[messages/delete-conversation]", error)
    return NextResponse.json({ ok: false, error: "Suppression échouée" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
