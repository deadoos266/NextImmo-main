/**
 * V97.31 P3-5.B.4 — POST /api/admin/users/force-reset
 *
 * Force le démarrage d'un reset password pour un user :
 *   - Génère un token reset (comme POST /api/auth/reset-password mais sans
 *     rate-limit IP, l'admin est trusted)
 *   - Envoie l'email reset au user (template existant)
 *
 * Auth : admin only.
 * Body : { email }.
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { resetPasswordTemplate } from "@/lib/email/templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  let body: { email?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 })
  }

  // Vérifie que l'user existe (sinon inutile d'envoyer un email)
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle()
  if (!user) {
    return NextResponse.json({ ok: false, error: "User introuvable" }, { status: 404 })
  }

  // Génère un token reset (similaire au POST /api/auth/reset-password)
  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()  // 1h

  // INSERT le token dans la table reset_tokens (si elle existe) OU stocke
  // sur la row user via une colonne dédiée. Pattern V0 : utilise auth.users
  // metadata ou une table dédiée. Voyons le pattern existant.
  // Pour MVP : on stocke dans users.reset_token + users.reset_token_expires_at
  const { error: updErr } = await supabaseAdmin
    .from("users")
    .update({
      reset_password_token: token,
      reset_password_expires: expiresAt,
    })
    .eq("email", email)
  if (updErr) {
    console.error("[admin/users/force-reset]", updErr)
    return NextResponse.json({ ok: false, error: "Impossible de générer le token" }, { status: 500 })
  }

  // Envoi email
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  const resetUrl = `${base}/auth/reset-password?token=${token}`
  const { subject, html, text } = resetPasswordTemplate({ resetUrl })

  await sendEmail({
    to: email,
    subject,
    html,
    text,
    templateName: "admin_force_reset",
    tags: [{ name: "type", value: "force_reset" }],
  })

  return NextResponse.json({ ok: true, message: `Email reset envoyé à ${email}` })
}
