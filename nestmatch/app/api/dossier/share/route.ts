import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateDossierToken } from "@/lib/dossierToken"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * POST /api/dossier/share
 * Génère un token de partage du dossier de l'utilisateur connecté.
 * Retourne une URL absolue qui donne accès en lecture seule à son dossier
 * pendant 7 jours.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  // Anti-farm : 10 tokens max / heure par email + 20 / heure par IP
  const ip = getClientIp(req.headers)
  const rlEmail = await checkRateLimitAsync(`dossier-share:email:${email}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rlEmail.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de partages récents, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rlEmail.retryAfterSec ?? 3600) } }
    )
  }
  const rlIp = await checkRateLimitAsync(`dossier-share:ip:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 })
  if (!rlIp.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de requêtes depuis cette adresse." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSec ?? 3600) } }
    )
  }

  // Refuser si user banni (la JWT peut encore être valide entre le ban et l'expiration)
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("is_banned")
    .eq("email", email)
    .single()
  if (user?.is_banned === true) {
    return NextResponse.json({ success: false, error: "Compte suspendu" }, { status: 403 })
  }

  let days = 7
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.days === "number" && body.days >= 1 && body.days <= 30) days = body.days
  } catch { /* noop */ }

  const token = generateDossierToken(email, days)
  // On NE fallback PAS sur le Host header — un attaquant pourrait forger un host
  // pour récupérer l'URL. Obligatoire d'avoir NEXT_PUBLIC_URL configuré.
  const base = process.env.NEXT_PUBLIC_URL || "https://nestmatch.fr"
  const url = `${base}/dossier-partage/${token}`

  return NextResponse.json({
    success: true,
    token,
    url,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
  })
}
