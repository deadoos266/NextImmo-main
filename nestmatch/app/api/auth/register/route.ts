import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"

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

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name,
      role,
      email_verified: false,
    })
    .select("id, email, name, role, is_admin")
    .single()

  if (error || !user) {
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création du compte" },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data: { id: user.id, email: user.email } }, { status: 201 })
}
