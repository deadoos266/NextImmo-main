/**
 * V72.2d — POST /api/notifications/[id]/dismiss
 *
 * Supprime (DELETE) une notification individuelle pour l'user courant.
 * Utilisé par la petite croix × en haut à droite de chaque notif card
 * dans le NotificationBell dropdown (mobile + desktop).
 *
 * Sécurité : la query DELETE filtre par user_email = session pour empêcher
 * de supprimer les notifs d'un autre user (la RLS Phase 5 le bloquerait
 * aussi mais on double-check côté app).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  // Rate-limit : 120/min (UX = clic rapide possible sur plusieurs notifs).
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`notif:dismiss:${ip}:${email}`, { max: 120, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
    )
  }

  const { id } = await ctx.params
  const idNum = Number(id)
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json({ error: "id invalide" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("id", idNum)
    .eq("user_email", email) // double-check même si RLS Phase 5 le couvre

  if (error) {
    console.error("[notifications dismiss]", error)
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
