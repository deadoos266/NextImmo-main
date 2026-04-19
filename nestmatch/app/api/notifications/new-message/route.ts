/**
 * POST /api/notifications/new-message — Envoie un email au destinataire d'un
 * message, si ses préférences l'autorisent. Appelé en fire-and-forget depuis
 * le client après l'insert du message dans Supabase.
 *
 * Body : { to: string, preview: string, convUrl?: string, relatedId?: string }
 *
 * Garde-fous :
 *   - Auth NextAuth (from = session.email, anti-spoof).
 *   - Rate-limit 3 emails / heure / to (pour éviter flood quand conv active).
 *   - Check profils.notif_messages_email pour le destinataire.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { sendEmail } from "@/lib/email/resend"
import { newMessageTemplate } from "@/lib/email/templates"
import { displayName } from "@/lib/privacy"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const fromEmail = session?.user?.email?.toLowerCase()
  if (!fromEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const p = body as { to?: unknown; preview?: unknown; convUrl?: unknown }
  const to = typeof p.to === "string" ? p.to.trim().toLowerCase() : ""
  const preview = typeof p.preview === "string" ? p.preview : ""
  if (!to || !preview) {
    return NextResponse.json({ ok: false, error: "to et preview requis" }, { status: 400 })
  }
  if (to === fromEmail) {
    // Rien à faire : on n'envoie pas d'email à soi-même.
    return NextResponse.json({ ok: true, skipped: "self" })
  }

  // Rate-limit par destinataire — évite le flood d'emails si conv très active.
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`newmsg-mail:${to}`, { max: 3, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: true, skipped: "rate_limited" })
  }
  // Rate-limit secondaire par expéditeur+IP (anti abus si user malveillant)
  const rlFrom = await checkRateLimitAsync(`newmsg-mail:from:${fromEmail}:${ip}`, { max: 30, windowMs: 60 * 60 * 1000 })
  if (!rlFrom.allowed) {
    return NextResponse.json({ ok: false, error: "Trop d'envois" }, { status: 429 })
  }

  // Respect des préférences email de l'user destinataire.
  const { data: prof } = await supabaseAdmin
    .from("profils")
    .select("nom, notif_messages_email")
    .eq("email", to)
    .maybeSingle()
  if (prof && prof.notif_messages_email === false) {
    return NextResponse.json({ ok: true, skipped: "pref_off" })
  }

  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
  const convUrl = typeof p.convUrl === "string" && p.convUrl.startsWith("/") ? `${base}${p.convUrl}` : `${base}/messages`
  const fromName = displayName(fromEmail, session.user?.name || null) || "Un utilisateur"

  const { subject, html, text } = newMessageTemplate({
    fromName,
    previewText: preview,
    convUrl,
  })
  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: "category", value: "new-message" }],
  })

  return NextResponse.json({ ok: result.ok, skipped: !result.ok })
}
