/**
 * POST /api/auth/verify-code
 *
 * Valide un code OTP à 6 chiffres envoyé par mail au signup.
 * Si OK -> set email_verified=true + clear token.
 * Rate-limité : 5 tentatives par email par 15 minutes (anti brute-force
 * sur le code court 6 chiffres).
 *
 * Body : { email: string, code: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { checkRateLimitAsync } from "../../../../lib/rateLimit"

const schema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Le code doit contenir 6 chiffres"),
})

const LIMIT = { max: 5, windowMs: 15 * 60 * 1000 }

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Données invalides" }, { status: 422 })
  }

  const email = parsed.data.email.toLowerCase()
  const code = parsed.data.code

  const rl = await checkRateLimitAsync(`verify-code:${email}`, LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 900) } }
    )
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email_verify_token, email_verify_expires, email_verified")
    .eq("email", email)
    .maybeSingle()

  if (!user) {
    // Réponse générique pour ne pas révéler l'existence du compte
    return NextResponse.json({ success: false, error: "Code invalide ou expiré" }, { status: 400 })
  }

  if (user.email_verified) {
    return NextResponse.json({ success: true, alreadyVerified: true })
  }

  if (!user.email_verify_token || user.email_verify_token !== code) {
    return NextResponse.json({ success: false, error: "Code invalide" }, { status: 400 })
  }

  if (user.email_verify_expires && new Date(user.email_verify_expires).getTime() < Date.now()) {
    return NextResponse.json({ success: false, error: "Code expiré. Redemandez-en un nouveau." }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      email_verified: true,
      email_verify_token: null,
      email_verify_expires: null,
    })
    .eq("id", user.id)

  if (error) {
    console.error("[verify-code]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  // Verrouille l'identité : au signup email le user a saisi prenom+nom
  // séparés (cf. /api/auth/register) et vient de certifier la possession
  // de la boîte mail. Identité figée + audit timestamp.
  const { error: lockErr } = await supabaseAdmin
    .from("profils")
    .update({
      identite_verrouillee: true,
      identite_confirmee_le: new Date().toISOString(),
    })
    .eq("email", email)
  if (lockErr) {
    // Non-fatal : l'OTP est validé, le compte accessible. Le verrouillage
    // sera rejoué via /onboarding/identite si le profils row n'existe pas
    // encore (cas improbable mais on garde une safety net).
    console.error("[verify-code] lock identite failed", lockErr)
  }

  return NextResponse.json({ success: true })
}
