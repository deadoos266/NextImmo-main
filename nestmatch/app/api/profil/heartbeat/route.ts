/**
 * V59.1 — POST /api/profil/heartbeat
 *
 * Met à jour `profils.last_seen_at = now()` pour le user authentifié.
 * Appelé toutes les 60s par le composant client `<HeartbeatPing />` monté
 * dans le layout (pages authentifiées).
 *
 * Sert à V59.2 : si receiver est "online" (last_seen < 10 min) → pas
 * d'email pour les nouveaux messages, notif in-app suffit.
 *
 * Sécurité :
 * - Auth NextAuth obligatoire (anti-anonymes qui spammeraient)
 * - No body (idempotent : juste un timestamp update)
 * - Rate-limit léger (1 req / 30s / user) pour éviter les pings excessifs
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // Rate-limit : 1 ping / 30s / user (anti-spam dev tool / accident)
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`heartbeat:${email}:${ip}`, { max: 1, windowMs: 30 * 1000 })
  if (!rl.allowed) {
    // On retourne 200 silencieusement — le client n'a pas besoin de savoir
    return NextResponse.json({ ok: true, throttled: true })
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from("profils")
    .update({ last_seen_at: nowIso })
    .eq("email", email)
  if (error) {
    // Best-effort — on ne fail pas la requête, le heartbeat est non-critique
    console.warn("[heartbeat] update failed:", error.message)
  }

  return NextResponse.json({ ok: true, lastSeenAt: nowIso })
}
