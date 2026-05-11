/**
 * V65.1 — POST /api/messages/mark-read
 *
 * Marque un ou plusieurs messages comme lus pour l'user connecté.
 * Body : { ids: number[] } OU { with: string, annonceId?: number }
 *
 * Mode "ids" : bulk update sur les messages dont l'id est dans la liste,
 *   filtrés par to_email = session (un user ne peut marquer comme lus que
 *   ses propres messages reçus).
 *
 * Mode "with" : mark-as-read tous les messages d'une conversation reçus
 *   par l'user de la part de `with` (filtré aussi par annonce_id si fourni).
 *
 * Préreq migration 058 (REVOKE UPDATE anon sur messages).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

interface Body {
  ids?: number[]
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

  // V97.14 P3-4.A — On stamp aussi read_at pour pouvoir afficher
  // "✓✓ Lu à HH:MM" côté expéditeur. Set seulement si lu=false avant
  // (sinon on overwrite à chaque réouverture de la conv).
  const nowIso = new Date().toISOString()

  // Mode "ids" : bulk
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.filter(n => typeof n === "number" && Number.isFinite(n))
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "ids invalides" }, { status: 400 })
    }
    if (ids.length > 200) {
      return NextResponse.json({ ok: false, error: "Trop d'ids (max 200)" }, { status: 400 })
    }
    const { error } = await supabaseAdmin
      .from("messages")
      .update({ lu: true, read_at: nowIso })
      .in("id", ids)
      .eq("to_email", me)
      .eq("lu", false)  // V97.14 — évite d'écraser un read_at existant
    if (error) {
      console.error("[messages/mark-read ids]", error)
      return NextResponse.json({ ok: false, error: "Update échoué" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, count: ids.length })
  }

  // Mode "with" : conversation entière
  const withEmail = typeof body.with === "string" ? body.with.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(withEmail)) {
    return NextResponse.json({ ok: false, error: "with manquant ou invalide" }, { status: 400 })
  }
  let q = supabaseAdmin
    .from("messages")
    .update({ lu: true, read_at: nowIso })  // V97.14
    .eq("to_email", me)
    .eq("from_email", withEmail)
    .eq("lu", false)
  if (body.annonceId !== undefined && body.annonceId !== null) {
    const n = Number(body.annonceId)
    if (Number.isFinite(n) && n > 0) {
      q = q.eq("annonce_id", n)
    }
  }
  const { error } = await q
  if (error) {
    console.error("[messages/mark-read with]", error)
    return NextResponse.json({ ok: false, error: "Update échoué" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
