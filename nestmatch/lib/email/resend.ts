/**
 * Client Resend + helper sendEmail(...).
 *
 * Mode "graceful fallback" : si `RESEND_API_KEY` est absent, on log ce qu'on
 * aurait envoyé et on retourne ok=false sans crasher. Permet de développer
 * localement et de déployer sans compte Resend tant que Paul n'a pas validé
 * son domaine.
 *
 * Templates : HTML strings (pas de dépendance react-email, plus léger).
 *
 * V87.3 — Logging email_logs DB + check suppress list :
 *  - Avant envoi : check si l'email est dans email_suppress_list (bounce/
 *    complaint). Si oui → skip envoi (évite spam + amélioration deliverability).
 *  - Après envoi réussi : INSERT row email_logs status='sent' avec resend_id.
 *    Le webhook /api/webhooks/resend UPDATE ce row avec delivered/bounced.
 *  - Best-effort : si DB down, on continue l'envoi (préserve fonctionnalité).
 */

import { Resend } from "resend"
import { supabaseAdmin } from "@/lib/supabase-server"

const apiKey = process.env.RESEND_API_KEY
const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
const fromName = process.env.RESEND_FROM_NAME || "KeyMatch"
const replyTo = process.env.RESEND_REPLY_TO

const resend = apiKey ? new Resend(apiKey) : null

if (!apiKey && process.env.NODE_ENV === "production") {
  console.error("[email] RESEND_API_KEY manquante — tous les emails sont désactivés en prod")
}

export type SendAttachment = {
  filename: string
  /** Base64 string ou Buffer Node. Resend accepte les deux. */
  content: string | Buffer
  contentType?: string
}

export type SendArgs = {
  to: string
  subject: string
  html: string
  text?: string
  tags?: { name: string; value: string }[]
  /** V32.5 — pièces jointes (ex: PDF du bail signé). */
  attachments?: SendAttachment[]
  /**
   * V50.1 — email de l'expéditeur applicatif (pas le `from` SMTP).
   * Sert au guard "self-email" : si `senderEmail === to`, on saute l'envoi.
   * Cas reproduit : un proprio s'envoie un message → /api/notifications/new-message
   * lui notifie son propre message par email. Le check existait déjà côté route
   * new-message, on le déplace ici pour couvrir TOUS les triggers (bail, préavis,
   * relance, quittance, etc.) by construction. Optionnel : si non fourni, l'envoi
   * passe (utile pour OTP / reset password où il n'y a pas de "sender" applicatif).
   */
  senderEmail?: string
  /**
   * V87.3 — Nom du template pour stats par template dans /admin/emails.
   * Ex: 'bail_invitation', 'candidature_acceptee', 'loyer_retard_j5'.
   * Si non fourni → 'unknown'.
   */
  templateName?: string
}

export type SendResult = { ok: true; id?: string } | { ok: false; error: string; skipped?: boolean }

/**
 * V87.3 — Check si l'email est dans la suppress list (bounce/complaint).
 * Si oui, on skip l'envoi pour préserver la réputation du domaine.
 * Best-effort : si DB down, on continue (préserve fonctionnalité).
 */
async function isEmailSuppressed(email: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("email_suppress_list")
      .select("email")
      .eq("email", email.toLowerCase())
      .is("removed_at", null)
      .maybeSingle()
    return !!data
  } catch {
    return false  // DB down → on n'empêche pas l'envoi
  }
}

/**
 * V87.3 — Log INSERT après envoi Resend réussi. Best-effort.
 */
async function logEmailSent(resendId: string | undefined, args: SendArgs): Promise<void> {
  try {
    await supabaseAdmin
      .from("email_logs")
      .insert({
        resend_id: resendId,
        to_email: args.to,
        from_email: from,
        subject: args.subject,
        template_name: args.templateName || "unknown",
        tags: args.tags ? args.tags : null,
        status: "sent",
      })
  } catch (e) {
    console.warn("[email] log insert failed (non-blocking):", e)
  }
}

export async function sendEmail({ to, subject, html, text, tags, attachments, senderEmail, templateName }: SendArgs): Promise<SendResult> {
  // V50.1 — guard self-email (voir SendArgs.senderEmail)
  if (senderEmail && to && senderEmail.toLowerCase() === to.toLowerCase()) {
    console.warn("[email] sendEmail skipped (self-email)", { to, senderEmail, subject })
    return { ok: false, error: "Self-email blocked", skipped: true }
  }
  if (!resend) {
    console.warn("[email] sendEmail skipped (no RESEND_API_KEY)", { to, subject })
    return { ok: false, error: "Resend not configured", skipped: true }
  }
  // V87.3 — suppress list check (bounce/complaint protection)
  if (await isEmailSuppressed(to)) {
    console.warn("[email] sendEmail skipped (in suppress_list)", { to, subject })
    return { ok: false, error: "Email in suppress list", skipped: true }
  }
  try {
    const res = await resend.emails.send({
      from: `${fromName} <${from}>`,
      to,
      replyTo,
      subject,
      html,
      text,
      tags,
      attachments,
    })
    if (res.error) {
      console.error("[email] Resend error", res.error)
      return { ok: false, error: res.error.message }
    }
    // V87.3 — log INSERT row 'sent' (webhook UPDATE-ra delivered/bounced ensuite)
    if (res.data?.id) {
      await logEmailSent(res.data.id, { to, subject, html, text, tags, attachments, senderEmail, templateName })
    }
    return { ok: true, id: res.data?.id }
  } catch (err) {
    console.error("[email] sendEmail exception", err)
    return { ok: false, error: err instanceof Error ? err.message : "Unknown" }
  }
}
