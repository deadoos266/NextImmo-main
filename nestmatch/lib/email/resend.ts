/**
 * Client Resend + helper sendEmail(...).
 *
 * Mode "graceful fallback" : si `RESEND_API_KEY` est absent, on log ce qu'on
 * aurait envoyé et on retourne ok=false sans crasher. Permet de développer
 * localement et de déployer sans compte Resend tant que Paul n'a pas validé
 * son domaine.
 *
 * Templates : HTML strings (pas de dépendance react-email, plus léger).
 */

import { Resend } from "resend"

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
}

export type SendResult = { ok: true; id?: string } | { ok: false; error: string; skipped?: boolean }

export async function sendEmail({ to, subject, html, text, tags, attachments, senderEmail }: SendArgs): Promise<SendResult> {
  // V50.1 — guard self-email (voir SendArgs.senderEmail)
  if (senderEmail && to && senderEmail.toLowerCase() === to.toLowerCase()) {
    console.warn("[email] sendEmail skipped (self-email)", { to, senderEmail, subject })
    return { ok: false, error: "Self-email blocked", skipped: true }
  }
  if (!resend) {
    console.warn("[email] sendEmail skipped (no RESEND_API_KEY)", { to, subject })
    return { ok: false, error: "Resend not configured", skipped: true }
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
    return { ok: true, id: res.data?.id }
  } catch (err) {
    console.error("[email] sendEmail exception", err)
    return { ok: false, error: err instanceof Error ? err.message : "Unknown" }
  }
}
