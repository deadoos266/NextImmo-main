/**
 * V87.2 — Webhook Resend : reçoit les events delivery / bounce / complaint /
 * open / click et UPDATE email_logs en conséquence.
 *
 * Setup côté Resend :
 *   https://resend.com/webhooks → Add endpoint
 *   URL : https://keymatch-immo.fr/api/webhooks/resend
 *   Events à cocher : email.sent, email.delivered, email.bounced,
 *                     email.complained, email.opened, email.clicked
 *   Signing secret → RESEND_WEBHOOK_SECRET en env Vercel
 *
 * Sécurité : vérification HMAC signature Svix (Resend utilise Svix).
 * Sans signature valide → 401. Sans RESEND_WEBHOOK_SECRET configuré →
 * mode "trust" (insert sans vérif, OK pour dev, dangereux en prod si
 * URL connue publiquement).
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { createHmac, timingSafeEqual } from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Vérifie la signature Svix (utilisée par Resend).
 * Headers : svix-id, svix-timestamp, svix-signature
 * Signature format : "v1,<base64-encoded HMAC SHA256(id.timestamp.body)>"
 */
function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  signatureHeader: string,
  body: string
): boolean {
  if (!secret.startsWith("whsec_")) return false
  const secretBytes = Buffer.from(secret.slice(6), "base64")
  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64")

  // signature header peut contenir multiple sigs séparés par espace : "v1,sig1 v1,sig2"
  const parts = signatureHeader.split(" ")
  for (const part of parts) {
    const [, sig] = part.split(",")
    if (!sig) continue
    try {
      const sigBuf = Buffer.from(sig, "base64")
      const expBuf = Buffer.from(expected, "base64")
      if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
        return true
      }
    } catch {
      // skip
    }
  }
  return false
}

type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "email.delivery_delayed"
  | "email.failed"

type ResendEvent = {
  type: ResendEventType
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[] | string
    subject: string
    bounce?: { type?: string; subType?: string; message?: string }
    click?: { ipAddress?: string; userAgent?: string; link?: string }
    [k: string]: unknown
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const bodyText = await req.text()

  // Vérif signature si secret configuré
  if (secret) {
    const svixId = req.headers.get("svix-id") || ""
    const svixTimestamp = req.headers.get("svix-timestamp") || ""
    const svixSignature = req.headers.get("svix-signature") || ""
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ ok: false, error: "Missing Svix headers" }, { status: 401 })
    }
    if (!verifySvixSignature(secret, svixId, svixTimestamp, svixSignature, bodyText)) {
      console.warn("[webhooks/resend] Invalid signature", { svixId })
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 })
    }
  } else {
    console.warn("[webhooks/resend] RESEND_WEBHOOK_SECRET not set — insecure mode")
  }

  let event: ResendEvent
  try {
    event = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const { type, data } = event
  if (!type || !data?.email_id) {
    return NextResponse.json({ ok: false, error: "Missing type or email_id" }, { status: 400 })
  }

  const resendId = data.email_id
  const toEmail = Array.isArray(data.to) ? data.to[0] : data.to
  const now = new Date().toISOString()

  // Mapping event type → update payload
  const update: Record<string, unknown> = { updated_at: now }
  let suppressEntry: { email: string; reason: string; reason_detail: string } | null = null

  switch (type) {
    case "email.sent":
      update.status = "sent"
      break
    case "email.delivered":
      update.status = "delivered"
      update.delivered_at = now
      break
    case "email.opened":
      update.status = "opened"
      update.opened_at = now
      break
    case "email.clicked":
      update.status = "clicked"
      update.clicked_at = now
      break
    case "email.bounced": {
      update.status = "bounced"
      update.bounced_at = now
      const bounceType = data.bounce?.type || "undetermined"
      update.bounce_type = bounceType
      update.error_message = data.bounce?.message || null
      // Auto-suppress sur hard bounce
      if (bounceType === "hard" || bounceType === "Permanent") {
        suppressEntry = {
          email: toEmail,
          reason: "hard_bounce",
          reason_detail: data.bounce?.message || "Hard bounce via Resend webhook",
        }
      }
      break
    }
    case "email.complained":
      update.status = "complained"
      update.complained_at = now
      suppressEntry = {
        email: toEmail,
        reason: "complaint",
        reason_detail: "Marqué spam par destinataire",
      }
      break
    case "email.delivery_delayed":
      // Pas de change status, on attend delivered/bounced final
      update.metadata = { delivery_delayed_at: now }
      break
    case "email.failed":
      update.status = "failed"
      update.error_message = "Resend reported failure"
      break
    default:
      console.warn("[webhooks/resend] Unknown event type", type)
      return NextResponse.json({ ok: true, message: "Event type ignored" })
  }

  // UPDATE email_logs par resend_id (UPSERT au cas où on n'a pas le row)
  const { data: existing } = await supabaseAdmin
    .from("email_logs")
    .select("id")
    .eq("resend_id", resendId)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin
      .from("email_logs")
      .update(update)
      .eq("id", existing.id)
  } else {
    // Row pas encore créée — INSERT (cas où webhook arrive avant que le
    // SDK ait pu logger le sent, ou si row jamais créée pour cause de race)
    await supabaseAdmin
      .from("email_logs")
      .insert({
        resend_id: resendId,
        to_email: toEmail,
        from_email: data.from,
        subject: data.subject,
        ...update,
      })
  }

  // Ajout suppress list si bounce hard / complaint
  if (suppressEntry) {
    await supabaseAdmin
      .from("email_suppress_list")
      .upsert({
        email: suppressEntry.email.toLowerCase(),
        reason: suppressEntry.reason,
        reason_detail: suppressEntry.reason_detail,
        added_by: "webhook",
      }, { onConflict: "email" })
  }

  return NextResponse.json({ ok: true, event: type, email_id: resendId })
}
