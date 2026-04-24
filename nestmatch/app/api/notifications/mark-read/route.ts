/**
 * POST /api/notifications/mark-read — Marque les notifs de l'user comme lues.
 *
 * Body JSON (tous optionnels) :
 *   { ids?: number[]  — si fourni, marque seulement ces ids, à condition
 *                        qu'ils appartiennent à l'user (sinon ignorés).
 *     all?: boolean  — si true, marque toutes les non-lues de l'user. }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  // Rate-limit mark-read : 60/min (UX normale = quelques clics, un attaquant
  // qui boucle sur ids[] infinis paie ici avant de toucher la DB).
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`notif:mark-read:${ip}:${email}`, { max: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
    )
  }

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const p = body as { ids?: unknown; all?: unknown }

  if (p.all === true) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ lu: true })
      .eq("user_email", email)
      .eq("lu", false)
    if (error) {
      console.error("[notifications mark-read all]", error)
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const ids = Array.isArray(p.ids) ? p.ids.filter((x): x is number => typeof x === "number") : []
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids ou all requis" }, { status: 400 })
  }

  // Scope strict à l'user : impossible de marquer les notifs d'un autre.
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ lu: true })
    .eq("user_email", email)
    .in("id", ids)
  if (error) {
    console.error("[notifications mark-read]", error)
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
