/**
 * V97.39.32 — Email dispatcher KeyMatch — Brevo uniquement.
 *
 * Historiquement (V97.39.19) il y avait un dispatcher Resend ↔ Brevo via
 * `EMAIL_PROVIDER` env var. Avec Phase 5 cutover validée 2026-05-17 et la
 * volonté de Paul de supprimer le code mort, on simplifie à Brevo only.
 *
 * Si Brevo plante un jour, le rollback = re-cloner V97.39.31 (avant ce
 * commit) + flip EMAIL_PROVIDER=resend. Pas idéal mais acceptable car Brevo
 * Free 300/jour est largement suffisant et leur SLA est bon.
 *
 * Architecture :
 *   sendEmail(args) → lib/email/brevo.ts → POST api.brevo.com/v3/smtp/email
 *
 * Tous les ~22 call sites continuent d'importer `from "@/lib/email"` —
 * le dispatcher est gardé comme couche d'abstraction au cas où on veut
 * réintroduire un provider plus tard.
 */

import { sendEmailBrevo } from "./brevo"

export type SendAttachment = {
  filename: string
  /** Base64 string ou Buffer Node. */
  content: string | Buffer
  contentType?: string
}

export type SendArgs = {
  to: string
  subject: string
  html: string
  text?: string
  tags?: { name: string; value: string }[]
  /** Pièces jointes (ex: PDF du bail signé). */
  attachments?: SendAttachment[]
  /**
   * V50.1 — email de l'expéditeur applicatif (pas le `from` SMTP).
   * Sert au guard "self-email" : si `senderEmail === to`, on saute l'envoi.
   */
  senderEmail?: string
  /**
   * V87.3 — Nom du template pour stats par template dans /admin/emails.
   */
  templateName?: string
}

export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; skipped?: boolean }

/**
 * Envoie un email via Brevo (api.brevo.com/v3/smtp/email).
 *
 * Garde-fous appliqués automatiquement (côté brevo.ts) :
 *  - self-email guard : skip si senderEmail === to (évite spam own inbox)
 *  - suppress_list : skip si destinataire dans email_suppress_list DB
 *  - email_logs insert : trace tous les envois (status=sent + resend_id legacy column)
 *  - timeout 10s AbortController
 *
 * Cf docs/PHASE5_BREVO_SETUP.md.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (!process.env.BREVO_API_KEY) {
    console.warn("[email] BREVO_API_KEY absent — envoi skip", {
      to: args.to,
      subject: args.subject,
    })
    return { ok: false, error: "Brevo not configured", skipped: true }
  }
  return sendEmailBrevo(args)
}

/**
 * Helper diagnostic exposé pour /admin/operations.
 */
export function getActiveEmailProvider(): {
  provider: "brevo"
  configured: boolean
  fromEmail: string | undefined
} {
  return {
    provider: "brevo",
    configured: !!process.env.BREVO_API_KEY,
    fromEmail: process.env.BREVO_FROM_EMAIL,
  }
}
