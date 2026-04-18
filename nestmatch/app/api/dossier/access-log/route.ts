/**
 * POST /api/dossier/access-log
 *   Enregistre un accès à un dossier partagé (depuis /dossier-partage/[token]).
 *   Body : { token: string, userAgent?: string }
 *   Vérifie le token HMAC → hash token + IP → insert. Rate-limit 5/min par IP.
 *
 * GET /api/dossier/access-log
 *   Réservé au locataire propriétaire du dossier (getServerSession).
 *   Renvoie les 50 derniers accès groupés par token_hash.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { verifyDossierToken } from "@/lib/dossierToken"
import { hashToken, hashIP } from "@/lib/dossierAccessLog"
import { checkRateLimit, getClientIp } from "@/lib/rateLimit"

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = checkRateLimit(`dossier-access-log:${ip}`, { max: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 })
  }

  let body: { token?: string; userAgent?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 })
  }

  const token = typeof body.token === "string" ? body.token : null
  if (!token) return NextResponse.json({ error: "Token manquant" }, { status: 400 })

  const payload = verifyDossierToken(token)
  if (!payload) return NextResponse.json({ error: "Token invalide" }, { status: 401 })

  const userAgent = typeof body.userAgent === "string" ? body.userAgent.slice(0, 200) : null

  const { error } = await supabaseAdmin.from("dossier_access_log").insert({
    email: payload.email.toLowerCase(),
    token_hash: hashToken(token),
    ip_hash: hashIP(ip || "unknown"),
    user_agent: userAgent,
  })

  if (error) {
    // Échec silencieux côté client — ne bloque pas l'affichage du dossier.
    console.error("[access-log insert]", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("dossier_access_log")
    .select("token_hash, ip_hash, user_agent, accessed_at")
    .eq("email", email)
    .order("accessed_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ logs: data || [] })
}
