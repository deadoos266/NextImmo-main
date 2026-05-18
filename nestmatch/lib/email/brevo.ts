/**
 * V97.39.19 P3 Phase 5 — Provider Brevo (alternatif à Resend).
 *
 * Brevo (ex-Sendinblue) : provider français, plan gratuit 300 emails/jour
 * (~9000/mois), RGPD-natif (données en EU), API REST simple.
 * Sert de remplaçant à Resend pour la Phase 5 du plan migration OVH.
 *
 * Signature identique à sendEmail() de resend.ts pour permettre le swap
 * via le wrapper lib/email/index.ts (EMAIL_PROVIDER env var).
 *
 * Format API : POST https://api.brevo.com/v3/smtp/email
 * Doc : https://developers.brevo.com/reference/sendtransacemail
 *
 * Pré-requis activation prod :
 *   1. Compte Brevo (https://onboarding.brevo.com/account/register)
 *   2. Vérifier le domaine keymatch-immo.fr (Senders & IP → Domains)
 *   3. Ajouter DKIM + SPF + DMARC dans OVH zone DNS (cf README setup)
 *   4. Récupérer API key v3 (Senders & IP → API Keys → Create new API key)
 *   5. Set env vars Vercel :
 *      - EMAIL_PROVIDER=brevo
 *      - BREVO_API_KEY=xkeysib-xxxxxxxx
 *      - BREVO_FROM_EMAIL=noreply@keymatch-immo.fr (doit être vérifié domaine)
 *      - BREVO_FROM_NAME=KeyMatch
 *      - BREVO_REPLY_TO=contact@keymatch-immo.fr (optionnel)
 */

import { supabaseAdmin } from "@/lib/supabase-server"
// V97.39.32 — Types depuis index.ts (resend.ts supprimé).
// Type-only import → pas de circular runtime.
import type { SendArgs, SendResult } from "./index"

const apiKey = process.env.BREVO_API_KEY
const fromEmail = process.env.BREVO_FROM_EMAIL || "noreply@keymatch-immo.fr"
const fromName = process.env.BREVO_FROM_NAME || "KeyMatch"
const replyToEmail = process.env.BREVO_REPLY_TO

interface BrevoEmailRequest {
  sender: { name: string; email: string }
  to: { email: string; name?: string }[]
  replyTo?: { email: string }
  subject: string
  htmlContent: string
  textContent?: string
  tags?: string[]
  attachment?: { name: string; content: string }[]
}

interface BrevoSendResponse {
  messageId?: string
  code?: string
  message?: string
}

async function isEmailSuppressedBrevo(email: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("email_suppress_list")
      .select("email")
      .eq("email", email.toLowerCase())
      .is("removed_at", null)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

async function logEmailSentBrevo(messageId: string | undefined, args: SendArgs): Promise<void> {
  try {
    await supabaseAdmin
      .from("email_logs")
      .insert({
        // V97.39.19 — on stocke le messageId Brevo dans resend_id (même colonne,
        // legacy nom — à renommer en provider_message_id dans une migration future
        // si on coupe vraiment Resend).
        resend_id: messageId,
        to_email: args.to,
        from_email: fromEmail,
        subject: args.subject,
        template_name: args.templateName || "unknown",
        tags: args.tags ? args.tags : null,
        status: "sent",
      })
  } catch (e) {
    console.warn("[email-brevo] log insert failed (non-blocking):", e)
  }
}

/**
 * Convertit le format Resend `tags: [{name, value}]` en format Brevo
 * `tags: ["name:value"]`. Brevo accepte juste un array de strings, on
 * concatène pour préserver l'info.
 */
function convertTags(tags: SendArgs["tags"]): string[] | undefined {
  if (!tags || tags.length === 0) return undefined
  return tags.map(t => `${t.name}:${t.value}`)
}

/**
 * Convertit les attachments. Resend accepte Buffer | string base64,
 * Brevo exige base64 string uniquement.
 */
function convertAttachments(attachments: SendArgs["attachments"]): BrevoEmailRequest["attachment"] | undefined {
  if (!attachments || attachments.length === 0) return undefined
  return attachments.map(a => ({
    name: a.filename,
    content: typeof a.content === "string"
      ? a.content
      : Buffer.from(a.content).toString("base64"),
  }))
}

export async function sendEmailBrevo({
  to,
  subject,
  html,
  text,
  tags,
  attachments,
  senderEmail,
  templateName,
}: SendArgs): Promise<SendResult> {
  // Guard self-email (V50.1 cohérent avec Resend)
  if (senderEmail && to && senderEmail.toLowerCase() === to.toLowerCase()) {
    console.warn("[email-brevo] skipped (self-email)", { to, senderEmail, subject })
    return { ok: false, error: "Self-email blocked", skipped: true }
  }

  if (!apiKey) {
    console.warn("[email-brevo] skipped (no BREVO_API_KEY)", { to, subject })
    return { ok: false, error: "Brevo not configured", skipped: true }
  }

  // Suppress list check (cohérent avec Resend)
  if (await isEmailSuppressedBrevo(to)) {
    console.warn("[email-brevo] skipped (in suppress_list)", { to, subject })
    return { ok: false, error: "Email in suppress list", skipped: true }
  }

  const payload: BrevoEmailRequest = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  }
  if (text) payload.textContent = text
  if (replyToEmail) payload.replyTo = { email: replyToEmail }
  const brevoTags = convertTags(tags)
  if (brevoTags) payload.tags = brevoTags
  const brevoAttachments = convertAttachments(attachments)
  if (brevoAttachments) payload.attachment = brevoAttachments

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const body: BrevoSendResponse = await res.json().catch(() => ({}))

    if (!res.ok) {
      const error = body.message || `HTTP ${res.status}`
      console.error("[email-brevo] API error", res.status, body)
      return { ok: false, error }
    }

    if (body.messageId) {
      await logEmailSentBrevo(body.messageId, { to, subject, html, text, tags, attachments, senderEmail, templateName })
    }

    return { ok: true, id: body.messageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown"
    console.error("[email-brevo] sendEmail exception", err)
    return { ok: false, error: msg }
  }
}
