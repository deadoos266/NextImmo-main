import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

const schema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z
    .string()
    .min(8, "Le nouveau mot de passe doit contenir au moins 8 caracteres")
    .max(128, "Mot de passe trop long"),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  // Anti brute-force sur le mot de passe actuel — 5 tentatives / 15 min / email + IP
  const ip = getClientIp(req.headers)
  const rlEmail = await checkRateLimitAsync(`change-pw:email:${email}`, { max: 5, windowMs: 15 * 60 * 1000 })
  if (!rlEmail.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rlEmail.retryAfterSec ?? 900) } }
    )
  }
  const rlIp = await checkRateLimitAsync(`change-pw:ip:${ip}`, { max: 15, windowMs: 15 * 60 * 1000 })
  if (!rlIp.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives depuis cette adresse." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSec ?? 900) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps de requete invalide" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Donnees invalides" }, { status: 422 })
  }

  const { currentPassword, newPassword } = parsed.data

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, password_hash")
    .eq("email", email)
    .single()

  if (!user || !user.password_hash) {
    return NextResponse.json(
      { success: false, error: "Compte Google : changement de mot de passe non disponible. Utilisez la gestion de votre compte Google." },
      { status: 400 }
    )
  }

  const ok = await bcrypt.compare(currentPassword, user.password_hash)
  if (!ok) {
    return NextResponse.json({ success: false, error: "Mot de passe actuel incorrect" }, { status: 401 })
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ success: false, error: "Le nouveau mot de passe doit etre different de l'actuel" }, { status: 422 })
  }

  const newHash = await bcrypt.hash(newPassword, 12)
  const { error } = await supabaseAdmin
    .from("users")
    .update({ password_hash: newHash })
    .eq("id", user.id)

  if (error) {
    console.error("[/api/account/change-password]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
