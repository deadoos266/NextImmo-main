/**
 * V97.39.19 P3 Phase 5 — Email dispatcher Resend ↔ Brevo.
 *
 * Wrapper qui choisit le provider à runtime via `EMAIL_PROVIDER` :
 *   - `resend` (défaut, comportement historique inchangé)
 *   - `brevo` (provider FR, plan gratuit 300/jour, RGPD-natif)
 *
 * Permet de switcher de Resend à Brevo (Phase 5 plan migration OVH)
 * sans toucher aux 22 call sites existants — il suffit de :
 *   1. Set `EMAIL_PROVIDER=brevo` dans Vercel env
 *   2. Set `BREVO_API_KEY=xkeysib-xxx`
 *   3. Set `BREVO_FROM_EMAIL=noreply@keymatch-immo.fr`
 *   4. Vérifier domaine keymatch-immo.fr dans Brevo (DKIM/SPF/DMARC OVH zone)
 *   5. Redeploy → tous les emails partent via Brevo
 *
 * Si `EMAIL_PROVIDER=brevo` mais `BREVO_API_KEY` absent → fallback Resend.
 * Si les 2 sont absents → graceful no-op (log + ok:false), pas de crash.
 *
 * Les types `SendArgs` / `SendResult` / `SendAttachment` viennent de resend.ts
 * (source de vérité historique).
 *
 * Migration des call sites :
 *   - Ancien : import { sendEmail } from "@/lib/email/resend"
 *   - Nouveau : import { sendEmail } from "@/lib/email"
 * (L'ancien import "@/lib/email/resend" reste fonctionnel — il bypass le
 * dispatcher et reste Resend-only, utile pour les routes admin/test où
 * on veut tester explicitement Resend.)
 */

import { sendEmail as sendEmailResend } from "./resend"
import { sendEmailBrevo } from "./brevo"
import type { SendArgs, SendResult } from "./resend"

export type { SendArgs, SendResult, SendAttachment } from "./resend"

type EmailProvider = "resend" | "brevo"

function resolveProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER || "resend").toLowerCase().trim()
  if (raw === "brevo") return "brevo"
  return "resend"
}

/**
 * Envoie un email via le provider configuré (Resend par défaut, Brevo si
 * `EMAIL_PROVIDER=brevo` ET `BREVO_API_KEY` présent).
 *
 * Signature identique à `sendEmail` historique de lib/email/resend.ts.
 * Tous les call sites existants peuvent migrer en changeant simplement
 * l'import path.
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const provider = resolveProvider()

  if (provider === "brevo") {
    // Si Brevo configuré → on y va.
    // Si Brevo demandé mais non configuré (pas de BREVO_API_KEY) et que Resend
    // est dispo → on fallback sur Resend pour pas perdre l'email.
    // Cas d'usage : Paul a flippé l'env EMAIL_PROVIDER=brevo trop tôt en prod
    // avant d'avoir set BREVO_API_KEY → on évite la panne complète d'email.
    if (process.env.BREVO_API_KEY) {
      return sendEmailBrevo(args)
    }
    if (process.env.RESEND_API_KEY) {
      console.warn(
        "[email] EMAIL_PROVIDER=brevo mais BREVO_API_KEY absent — fallback Resend",
        { to: args.to, subject: args.subject },
      )
      return sendEmailResend(args)
    }
    // Ni Brevo ni Resend configurés → noop (graceful, comme avant)
    console.warn("[email] aucun provider configuré (ni BREVO_API_KEY ni RESEND_API_KEY)", {
      to: args.to,
      subject: args.subject,
    })
    return { ok: false, error: "No email provider configured", skipped: true }
  }

  // Provider = resend (défaut)
  return sendEmailResend(args)
}

/**
 * Helper diagnostic : utilisé par /api/admin/emails et /api/health pour
 * exposer le provider actif à l'admin. Pas critique pour les envois.
 */
export function getActiveEmailProvider(): {
  provider: EmailProvider
  configured: boolean
  fromEmail: string | undefined
} {
  const provider = resolveProvider()
  if (provider === "brevo") {
    return {
      provider: "brevo",
      configured: !!process.env.BREVO_API_KEY,
      fromEmail: process.env.BREVO_FROM_EMAIL,
    }
  }
  return {
    provider: "resend",
    configured: !!process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
  }
}
