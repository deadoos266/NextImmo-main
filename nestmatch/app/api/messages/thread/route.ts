/**
 * V65.1 — GET /api/messages/thread?with=:email&annonceId=:id
 *
 * Charge l'intégralité d'une conversation (messages échangés entre l'user
 * connecté et `with`, optionnellement filtrés par annonce_id).
 *
 * Sécurité :
 *   - NextAuth requis. me = session.email strictement.
 *   - Pas de check sur `with` : c'est juste un filtre sur from_email/to_email.
 *     On ne peut récupérer QUE les messages où me est l'un des 2 participants.
 *
 * Préreq migration 058 (REVOKE SELECT anon sur messages).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const withEmail = (req.nextUrl.searchParams.get("with") || "").trim().toLowerCase()
  if (!EMAIL_RE.test(withEmail)) {
    return NextResponse.json({ ok: false, error: "with invalide" }, { status: 400 })
  }

  const annonceIdRaw = req.nextUrl.searchParams.get("annonceId")
  let annonceId: number | null = null
  let scopeAnnonce: "specific" | "null" | "all" = "all"
  if (annonceIdRaw === "null" || annonceIdRaw === "") {
    scopeAnnonce = "null"
  } else if (annonceIdRaw) {
    const n = Number(annonceIdRaw)
    if (Number.isFinite(n) && n > 0) {
      annonceId = n
      scopeAnnonce = "specific"
    }
  }

  // Load both directions
  const [{ data: sent }, { data: received }] = await Promise.all([
    supabaseAdmin
      .from("messages")
      .select("*")
      .eq("from_email", me)
      .eq("to_email", withEmail),
    supabaseAdmin
      .from("messages")
      .select("*")
      .eq("from_email", withEmail)
      .eq("to_email", me),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all = [...(sent || []), ...(received || [])] as any[]
  if (scopeAnnonce === "specific") {
    all = all.filter(m => m.annonce_id === annonceId)
  } else if (scopeAnnonce === "null") {
    all = all.filter(m => !m.annonce_id)
  }
  all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return NextResponse.json({ ok: true, messages: all })
}
