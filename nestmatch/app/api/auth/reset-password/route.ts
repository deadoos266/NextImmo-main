/**
 * Réinitialisation de mot de passe — 2 endpoints dans un seul fichier :
 *
 * POST /api/auth/reset-password
 *   body { email } : demande de réinitialisation. Envoie un email avec un
 *   lien contenant un token. **Réponse toujours 200** même si l'email est
 *   inconnu (anti email enumeration).
 *
 * PUT /api/auth/reset-password
 *   body { token, password } : valide le token + update le password hash.
 *
 * Rate-limit strict sur la demande (anti spam). Token valide 1h (reset est
 * plus sensible qu'une simple vérif email, on réduit la fenêtre d'abus).
 */

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import crypto from "node:crypto"
import { z } from "zod"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"
import { sendEmail } from "../../../../lib/email/resend"
import { resetPasswordTemplate } from "../../../../lib/email/templates"

const requestSchema = z.object({
  email: z.string().email("Email invalide"),
})

const confirmSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères").max(128),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`reset-req:ip:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Trop de demandes, réessayez plus tard." }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: "JSON invalide" }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Email invalide" }, { status: 422 })
  }
  const email = parsed.data.email.toLowerCase()

  // Rate-limit par email aussi (anti spray ciblé)
  const rlEmail = await checkRateLimitAsync(`reset-req:email:${email}`, { max: 3, windowMs: 60 * 60 * 1000 })
  if (!rlEmail.allowed) {
    // Même réponse que succès — on ne donne aucun feedback sur l'existence du compte.
    return NextResponse.json({ success: true })
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle()

  // Anti-enumeration : on répond toujours succès, qu'il existe ou non.
  if (!user) {
    return NextResponse.json({ success: true })
  }

  const token = crypto.randomBytes(24).toString("hex")
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h

  const { error: updErr } = await supabaseAdmin
    .from("users")
    .update({ reset_password_token: token, reset_password_expires: expires })
    .eq("id", user.id)
  if (updErr) {
    console.error("[reset-password POST]", updErr)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
  const resetUrl = `${base}/auth/reset-password/${token}`
  const { subject, html, text } = resetPasswordTemplate({ resetUrl })
  // await : sur Vercel serverless, un void sendEmail peut être kill avant
  // que l'envoi soit complété (la function termine dès qu'elle retourne).
  try {
    await sendEmail({ to: email, subject, html, text })
  } catch (err) {
    console.error("[reset-password] sendEmail failed", err)
  }

  return NextResponse.json({ success: true })
}

export async function PUT(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`reset-confirm:ip:${ip}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Trop de tentatives" }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: "JSON invalide" }, { status: 400 })
  }
  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Données invalides"
    return NextResponse.json({ success: false, error: firstError }, { status: 422 })
  }
  const { token, password } = parsed.data

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, reset_password_expires")
    .eq("reset_password_token", token)
    .maybeSingle()
  if (!user) {
    return NextResponse.json({ success: false, error: "Lien invalide ou expiré" }, { status: 400 })
  }
  if (!user.reset_password_expires || new Date(user.reset_password_expires).getTime() < Date.now()) {
    return NextResponse.json({ success: false, error: "Lien expiré, demandez-en un nouveau" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      password_hash: passwordHash,
      reset_password_token: null,
      reset_password_expires: null,
    })
    .eq("id", user.id)
  if (error) {
    console.error("[reset-password PUT]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
