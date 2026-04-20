/**
 * POST /api/auth/resend-verify-code
 *
 * Renvoie un nouveau code OTP 6 chiffres par email.
 * Rate-limité : 2 renvois / email / 15 minutes (anti spam).
 * Reponse générique 200 {success: true} meme si l'email n'existe pas
 * ou est deja verifie (evite l'enumeration d'emails).
 *
 * Body : { email: string }
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { z } from "zod"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { checkRateLimitAsync } from "../../../../lib/rateLimit"
import { sendEmail } from "../../../../lib/email/resend"
import { verifyEmailTemplate } from "../../../../lib/email/templates"

const schema = z.object({
  email: z.string().email(),
})

const LIMIT = { max: 2, windowMs: 15 * 60 * 1000 }

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Email invalide" }, { status: 422 })
  }

  const email = parsed.data.email.toLowerCase()

  const rl = await checkRateLimitAsync(`resend-verify:${email}`, LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de demandes. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 900) } }
    )
  }

  // Cherche l'user. Si absent ou deja verifie, on renvoie 200 quand meme
  // pour ne pas reveler ces infos.
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, name, email_verified")
    .eq("email", email)
    .maybeSingle()

  if (!user || user.email_verified === true) {
    return NextResponse.json({ success: true })
  }

  const code = String(crypto.randomInt(100000, 1000000))
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      email_verify_token: code,
      email_verify_expires: expires,
    })
    .eq("id", user.id)

  if (error) {
    console.error("[resend-verify-code]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
  const verifyUrl = `${base}/api/auth/verify-email?token=${code}`
  const { subject, html, text } = verifyEmailTemplate({ userName: user.name, verifyUrl, code })
  try {
    await sendEmail({ to: email, subject, html, text })
  } catch (err) {
    console.error("[resend-verify-code] sendEmail failed", err)
  }

  return NextResponse.json({ success: true })
}
