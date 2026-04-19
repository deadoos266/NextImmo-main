/**
 * Templates HTML pour les emails transactionnels NestMatch.
 *
 * Pas de dépendance react-email : les emails sont simples, HTML inline,
 * compatible Gmail/Outlook/Apple Mail. Layout commun `wrap(...)` pour le
 * header logo + footer signature.
 */

import { BRAND } from "../brand"

const PALETTE = {
  bg: "#F7F4EF",
  card: "#ffffff",
  text: "#111111",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  border: "#e5e7eb",
  primary: "#111111",
  primaryContrast: "#ffffff",
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function wrap(title: string, body: string): string {
  const base = process.env.NEXT_PUBLIC_URL || BRAND.url || "https://nestmatch.fr"
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
</head>
<body style="background:${PALETTE.bg};margin:0;padding:24px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:${PALETTE.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${PALETTE.card};border-radius:20px;padding:32px 28px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${base}" style="text-decoration:none;color:${PALETTE.text};font-weight:800;font-size:22px;letter-spacing:-0.5px;">
                ${escapeHtml(BRAND.name || "NestMatch")}
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:14px;line-height:1.6;color:${PALETTE.text};">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;border-top:1px solid ${PALETTE.border};margin-top:24px;">
              <p style="font-size:11px;color:${PALETTE.textSubtle};line-height:1.5;text-align:center;margin:16px 0 0;">
                ${escapeHtml(BRAND.name || "NestMatch")} · <a href="${base}" style="color:${PALETTE.textSubtle};">${escapeHtml(base.replace(/^https?:\/\//, ""))}</a><br>
                Vous recevez cet email car vous avez un compte ${escapeHtml(BRAND.name || "NestMatch")}.
                <a href="${base}/parametres?tab=compte" style="color:${PALETTE.textSubtle};">Préférences de notifications</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${PALETTE.primary};color:${PALETTE.primaryContrast};padding:12px 28px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>`
}

export function verifyEmailTemplate(params: { userName: string | null; verifyUrl: string }): { subject: string; html: string; text: string } {
  const greeting = params.userName ? `Bienvenue, ${escapeHtml(params.userName)} !` : "Bienvenue !"
  const html = wrap(
    "Vérifiez votre email",
    `<h1 style="font-size:22px;margin:0 0 12px;color:${PALETTE.text};">${greeting}</h1>
     <p style="margin:0 0 18px;color:${PALETTE.text};">Confirmez votre adresse email pour activer votre compte. Ce lien est valide pendant 24 heures.</p>
     ${button(params.verifyUrl, "Vérifier mon email")}
     <p style="margin:18px 0 0;font-size:11px;color:${PALETTE.textSubtle};">Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.</p>`,
  )
  const text = `${greeting}\n\nConfirmez votre adresse email en cliquant sur ce lien (valide 24h) :\n${params.verifyUrl}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet email.`
  return { subject: "Vérifiez votre email", html, text }
}

export function resetPasswordTemplate(params: { resetUrl: string }): { subject: string; html: string; text: string } {
  const html = wrap(
    "Réinitialiser votre mot de passe",
    `<h1 style="font-size:22px;margin:0 0 12px;color:${PALETTE.text};">Réinitialiser votre mot de passe</h1>
     <p style="margin:0 0 18px;color:${PALETTE.text};">Quelqu'un (vous, on espère) a demandé à réinitialiser le mot de passe de ce compte. Ce lien est valide pendant 1 heure.</p>
     ${button(params.resetUrl, "Choisir un nouveau mot de passe")}
     <p style="margin:18px 0 0;font-size:11px;color:${PALETTE.textSubtle};">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe ne sera pas changé.</p>`,
  )
  const text = `Réinitialiser votre mot de passe\n\nOuvrez ce lien (valide 1h) pour définir un nouveau mot de passe :\n${params.resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`
  return { subject: "Réinitialiser votre mot de passe", html, text }
}

export function newMessageTemplate(params: { fromName: string; previewText: string; convUrl: string }): { subject: string; html: string; text: string } {
  const preview = params.previewText.length > 140 ? params.previewText.slice(0, 140) + "…" : params.previewText
  const html = wrap(
    "Nouveau message",
    `<h1 style="font-size:20px;margin:0 0 12px;color:${PALETTE.text};">Nouveau message de ${escapeHtml(params.fromName)}</h1>
     <div style="background:#f3f4f6;border-radius:12px;padding:14px 16px;margin:0 0 18px;font-size:14px;color:${PALETTE.text};white-space:pre-wrap;">${escapeHtml(preview)}</div>
     ${button(params.convUrl, "Ouvrir la conversation")}`,
  )
  const text = `Nouveau message de ${params.fromName}\n\n${preview}\n\nOuvrir : ${params.convUrl}`
  return { subject: `Nouveau message de ${params.fromName}`, html, text }
}
