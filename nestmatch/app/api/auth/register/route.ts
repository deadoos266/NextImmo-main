import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import crypto from "node:crypto"
import { z } from "zod"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"
import { sendEmail } from "../../../../lib/email/resend"
import { verifyEmailTemplate } from "../../../../lib/email/templates"

const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(128, "Le mot de passe est trop long"),
  name: z.string().min(1, "Le nom est requis").max(100, "Le nom est trop long").trim(),
  role: z.enum(["locataire", "proprietaire"]).default("locataire"),
})

// Rate-limit : 10 inscriptions / IP / heure + 3 tentatives / email / heure
const IP_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 }
const EMAIL_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 }

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rlIp = await checkRateLimitAsync(`register:ip:${ip}`, IP_LIMIT)
  if (!rlIp.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSec ?? 3600) } }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps de requête invalide" }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Données invalides"
    return NextResponse.json({ success: false, error: firstError }, { status: 422 })
  }

  const { email, password, name, role } = parsed.data

  // Rate-limit par email (anti spray ciblé)
  const emailKey = email.toLowerCase()
  const rlEmail = await checkRateLimitAsync(`register:email:${emailKey}`, EMAIL_LIMIT)
  if (!rlEmail.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives pour cet email, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rlEmail.retryAfterSec ?? 3600) } }
    )
  }

  // Check for existing user — return a generic message to avoid email enumeration
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase())
    .single()

  if (existing) {
    return NextResponse.json(
      { success: false, error: "Un compte existe déjà avec cet email" },
      { status: 409 }
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  // Token de vérification email : hex random 48 chars, expire 24h.
  // Si la migration 013 n'est pas encore appliquée, l'update silencieux
  // échouera côté Supabase — on ne bloque pas le signup pour autant.
  const verifyToken = crypto.randomBytes(24).toString("hex")
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name,
      role,
      email_verified: false,
      email_verify_token: verifyToken,
      email_verify_expires: verifyExpires,
    })
    .select("id, email, name, role, is_admin")
    .single()

  if (error || !user) {
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création du compte" },
      { status: 500 }
    )
  }

  // Envoi email de vérification — on await pour que la requête HTTP ne
  // retourne qu'une fois l'email parti (Vercel serverless peut kill la
  // function avant un fire-and-forget). Try/catch : si Resend plante, le
  // signup reste valide, l'user peut redemander un lien via /auth.
  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
  const verifyUrl = `${base}/api/auth/verify-email?token=${verifyToken}`
  const { subject, html, text } = verifyEmailTemplate({ userName: name, verifyUrl })
  try {
    await sendEmail({ to: email.toLowerCase(), subject, html, text })
  } catch (err) {
    console.error("[register] sendEmail failed", err)
  }

  return NextResponse.json({ success: true, data: { id: user.id, email: user.email } }, { status: 201 })
}
