import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import crypto from "node:crypto"
import { z } from "zod"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"
import { sendEmail } from "../../../../lib/email/resend"
import { verifyEmailTemplate } from "../../../../lib/email/templates"
import { IDENTITE_PATTERN } from "../../../../lib/profilHelpers"

const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(128, "Le mot de passe est trop long"),
  // Identité : 2 champs séparés, regex Unicode (lettres + accents + CJK +
  // tirets + apostrophes + espaces + points). Verrouillage définitif après
  // validation OTP — cf. /api/auth/verify-code.
  prenom: z
    .string()
    .trim()
    .min(1, "Le prénom est requis")
    .max(80, "Le prénom est trop long")
    .regex(IDENTITE_PATTERN, "Le prénom contient des caractères invalides"),
  nom: z
    .string()
    .trim()
    .min(1, "Le nom de famille est requis")
    .max(80, "Le nom de famille est trop long")
    .regex(IDENTITE_PATTERN, "Le nom de famille contient des caractères invalides"),
  role: z.enum(["locataire", "proprietaire"]).default("locataire"),
})

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

  const { email, password, prenom, nom, role } = parsed.data
  const fullName = `${prenom} ${nom}`.trim()

  const emailKey = email.toLowerCase()
  const rlEmail = await checkRateLimitAsync(`register:email:${emailKey}`, EMAIL_LIMIT)
  if (!rlEmail.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives pour cet email, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rlEmail.retryAfterSec ?? 3600) } }
    )
  }

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

  const verifyToken = String(crypto.randomInt(100000, 1000000))
  const verifyExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name: fullName,
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

  // Crée le row profils avec prenom + nom séparés + identite_verrouillee=false.
  // Le verrouillage définitif a lieu dans /api/auth/verify-code dès validation
  // du code OTP — à ce moment le user a officiellement certifié son identité.
  const { error: profilErr } = await supabaseAdmin.from("profils").upsert(
    {
      email: email.toLowerCase(),
      prenom,
      nom,
      identite_verrouillee: false,
    },
    { onConflict: "email" },
  )
  if (profilErr) {
    // Non-bloquant : le signup reste valide, le row profils sera créé
    // au premier UPSERT depuis /dossier ou /profil. On log quand même.
    console.error("[register] profils upsert failed", profilErr)
  }

  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
  const verifyUrl = `${base}/api/auth/verify-email?token=${verifyToken}`
  const { subject, html, text } = verifyEmailTemplate({ userName: fullName, verifyUrl, code: verifyToken })
  try {
    await sendEmail({ to: email.toLowerCase(), subject, html, text })
  } catch (err) {
    console.error("[register] sendEmail failed", err)
  }

  return NextResponse.json({ success: true, data: { id: user.id, email: user.email } }, { status: 201 })
}
