/**
 * GET /api/auth/verify-email?token=... — Valide un token envoyé par mail au
 * moment du signup. Si OK, set email_verified=true + clear token. Puis
 * redirige vers /parametres?verified=1.
 *
 * Si token invalide/expiré, redirige vers /auth?error=verify_failed.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabase-server"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token")
  const base = process.env.NEXT_PUBLIC_URL || url.origin

  if (!token || typeof token !== "string" || token.length < 32) {
    return NextResponse.redirect(`${base}/auth?error=verify_failed`)
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email, email_verify_expires")
    .eq("email_verify_token", token)
    .maybeSingle()

  if (!user) {
    return NextResponse.redirect(`${base}/auth?error=verify_failed`)
  }

  // Check expiration
  if (user.email_verify_expires && new Date(user.email_verify_expires).getTime() < Date.now()) {
    return NextResponse.redirect(`${base}/auth?error=verify_expired`)
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
    console.error("[verify-email]", error)
    return NextResponse.redirect(`${base}/auth?error=verify_failed`)
  }

  return NextResponse.redirect(`${base}/parametres?verified=1`)
}
