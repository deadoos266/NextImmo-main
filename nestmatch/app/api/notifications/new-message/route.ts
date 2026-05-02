/**
 * POST /api/notifications/new-message — Envoie un email au destinataire d'un
 * message, si ses préférences l'autorisent. Appelé en fire-and-forget depuis
 * le client après l'insert du message dans Supabase.
 *
 * Body : { to: string, preview: string, convUrl?: string, relatedId?: string,
 *          annonceId?: number | null }
 *
 * V59 — Anti-spam pattern Slack/Linear :
 *   - Si receiver online (last_seen < 10 min) → pas d'email (notif in-app suffit).
 *   - Si offline → email mais batch debounce 5 min par conversation (évite
 *     plusieurs emails si l'expéditeur tape 3 messages d'affilée).
 *   - Mode "digest" (opt-in via notif_preferences.message_recu_mode='digest') :
 *     pas d'email immédiat, on relègue au cron daily 8h /api/cron/messages-digest.
 *
 * Garde-fous existants :
 *   - Auth NextAuth (from = session.email, anti-spoof).
 *   - Rate-limit 3 emails / heure / to (filet de sécurité ; le smart timing
 *     est plus restrictif en pratique).
 *   - Check notif_preferences.message_recu (master toggle).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { sendEmail } from "@/lib/email/resend"
import { newMessageTemplate } from "@/lib/email/templates"
import { displayName } from "@/lib/privacy"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000  // 10 min
const BATCH_DEBOUNCE_MS = 5 * 60 * 1000     // 5 min

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
  const p = body as { to?: unknown; preview?: unknown; convUrl?: unknown; annonceId?: unknown }
  const to = typeof p.to === "string" ? p.to.trim().toLowerCase() : ""
  const preview = typeof p.preview === "string" ? p.preview : ""
  // V59.2 — annonceId optionnel pour calculer la conversation_key
  const annonceIdRaw = typeof p.annonceId === "number" ? p.annonceId : null
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

  // V54.2 — respect notif_preferences[message_recu] (avec fallback legacy
  // notif_messages_email via shouldSendEmailForEvent).
  const allowed = await shouldSendEmailForEvent(to, "message_recu")
  if (!allowed) {
    return NextResponse.json({ ok: true, skipped: "pref_off" })
  }

  // V59.2 — Récupère le mode messages + last_seen_at du receiver
  // pour décider si on envoie ou pas.
  const { data: receiverProf } = await supabaseAdmin
    .from("profils")
    .select("notif_preferences, last_seen_at")
    .eq("email", to)
    .maybeSingle()
  const prefs = (receiverProf?.notif_preferences || {}) as Record<string, unknown>
  // Mode default = "smart" (recommandé). Legacy / nouveaux users → smart.
  const messageMode = (typeof prefs.message_recu_mode === "string" ? prefs.message_recu_mode : "smart") as "smart" | "digest" | "all" | "none"

  // Mode "none" : déjà bloqué par allowed ci-dessus normalement (master toggle).
  // Mode "digest" : pas d'email immédiat, le cron daily relègue.
  if (messageMode === "digest") {
    return NextResponse.json({ ok: true, skipped: "digest_mode" })
  }

  // Mode "smart" : check online + batch debounce
  if (messageMode === "smart") {
    // 1. Online check : si last_seen < 10 min → notif in-app suffit
    if (receiverProf?.last_seen_at) {
      const lastSeenMs = new Date(receiverProf.last_seen_at).getTime()
      if (Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < ONLINE_THRESHOLD_MS) {
        return NextResponse.json({ ok: true, skipped: "online" })
      }
    }
    // 2. Batch debounce : si email déjà envoyé pour cette conv ces 5 dernières min → skip
    const conversationKey = `${fromEmail}::${to}::${annonceIdRaw ?? "null"}`
    const { data: lastEmail } = await supabaseAdmin
      .from("messages_emails_log")
      .select("sent_at")
      .eq("receiver_email", to)
      .eq("conversation_key", conversationKey)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastEmail?.sent_at) {
      const sentMs = new Date(lastEmail.sent_at).getTime()
      if (Number.isFinite(sentMs) && Date.now() - sentMs < BATCH_DEBOUNCE_MS) {
        return NextResponse.json({ ok: true, skipped: "batch_debounce" })
      }
    }
  }
  // Mode "all" : on envoie toujours (legacy comportement, déconseillé).

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
    senderEmail: fromEmail, // V50.1 — defense en profondeur (le check ligne 40 reste actif)
  })

  // V59.2 — log envoi pour batch debounce 5 min/conv (mode smart)
  if (result.ok) {
    try {
      const conversationKey = `${fromEmail}::${to}::${annonceIdRaw ?? "null"}`
      await supabaseAdmin.from("messages_emails_log").insert({
        receiver_email: to,
        conversation_key: conversationKey,
        sent_at: new Date().toISOString(),
      })
    } catch (e) {
      console.warn("[new-message] log insert failed:", e)
    }
  }

  return NextResponse.json({ ok: result.ok, skipped: !result.ok })
}
