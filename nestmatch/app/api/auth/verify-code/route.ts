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
import crypto from "node:crypto"
import { encode } from "next-auth/jwt"
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
    .select("id, email_verify_token, email_verify_expires, email_verified, role, is_admin, name")
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

  // V42 (Paul 2026-04-29) — Auto-login post-OTP.
  // User a flag : "quand on se crée notre compte ça nous demande de nous
  // reconnecter après donc c'est assez relou". Avant V42 : verify-code
  // renvoyait juste { success: true } et le client redirigeait vers
  // /auth?verified=1 où l'user devait re-saisir email + password.
  // Maintenant : on encode un JWT NextAuth (même format que /api/auth/[...nextauth])
  // et on pose le cookie session-token. Le client peut redirect direct vers
  // /annonces ; useSession() récupère la session via le cookie.
  //
  // Sécurité : le code OTP a été validé juste au-dessus, donc l'auth est
  // équivalente à un signIn manuel via credentials.
  const response = NextResponse.json({ success: true, autoLogin: true })

  try {
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      console.warn("[verify-code] NEXTAUTH_SECRET missing — skip auto-login (user will manually login)")
      return NextResponse.json({ success: true, autoLogin: false })
    }
    const maxAge = 30 * 24 * 60 * 60 // 30 jours, identique à NextAuth default
    const safeRole: "locataire" | "proprietaire" = user.role === "proprietaire" ? "proprietaire" : "locataire"
    const tokenPayload = {
      sub: user.id,
      id: user.id,
      email,
      name: user.name,
      role: safeRole,
      isAdmin: user.is_admin === true,
      // identiteVerrouillee=true : on vient de poser le verrouillage juste au-dessus
      identiteVerrouillee: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + maxAge,
      jti: crypto.randomUUID(),
    }
    const sessionToken = await encode({
      token: tokenPayload,
      secret,
      maxAge,
    })

    // NextAuth v4 utilise __Secure-next-auth.session-token en HTTPS prod,
    // next-auth.session-token en dev HTTP.
    const isProd = process.env.NODE_ENV === "production"
    const cookieName = isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token"
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge,
    })
  } catch (e) {
    console.error("[verify-code] auto-login JWT encode failed (fallback : user re-login manuel)", e)
    return NextResponse.json({ success: true, autoLogin: false })
  }

  return response
}
