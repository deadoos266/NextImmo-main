import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateDossierToken } from "@/lib/dossierToken"
import { hashToken } from "@/lib/dossierAccessLog"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * POST /api/dossier/share
 * Génère un token de partage du dossier de l'utilisateur connecté + enregistre
 * le lien en base avec un label choisi par le user (pour retrouver/révoquer).
 * Retourne une URL absolue qui donne accès en lecture seule pendant `days` jours.
 *
 * Body : { label: string (2-80 chars), days?: number (1-30, défaut 7) }
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

  // Parse body : label obligatoire, days optionnel
  const body = await req.json().catch(() => ({}))
  const rawLabel = typeof body?.label === "string" ? body.label.trim() : ""
  if (rawLabel.length < 2 || rawLabel.length > 80) {
    return NextResponse.json(
      { success: false, error: "Le nom du lien doit faire entre 2 et 80 caractères." },
      { status: 400 }
    )
  }
  let days = 7
  if (typeof body?.days === "number" && body.days >= 1 && body.days <= 30) days = body.days

  const token = generateDossierToken(email, days)
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  const url = `${base}/dossier-partage/${token}`
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  // Insert en base pour label/révocation/compteurs. Si la table n'existe pas
  // encore (migration 021 pas appliquée) → graceful : on renvoie le token
  // quand même, mais sans id DB.
  let id: string | null = null
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("dossier_share_tokens")
    .insert({
      email_locataire: email,
      label: rawLabel,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    })
    .select("id")
    .single()
  if (insErr) {
    if (insErr.code !== "42P01") {
      // Toute autre erreur DB : on log mais on continue (le token JWT est self-contained)
      console.error("[dossier/share] insert error:", insErr.message)
    }
  } else if (inserted?.id) {
    id = inserted.id as string
  }

  return NextResponse.json({
    success: true,
    token,
    url,
    expiresAt,
    id,
    label: rawLabel,
  })
}
