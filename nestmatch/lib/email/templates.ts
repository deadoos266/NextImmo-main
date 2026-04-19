/**
 * Templates HTML pour les emails transactionnels NestMatch.
 *
 * Pas de dépendance react-email : HTML inline + tables pour compat max
 * (Gmail desktop/mobile, Apple Mail, Outlook web, Yahoo Mail, Thunderbird).
 * Le logo est inliné en SVG — supporté par la plupart des clients modernes,
 * fallback sur le nom texte quand le SVG ne s'affiche pas (Outlook desktop).
 */

import { BRAND } from "../brand"

const PALETTE = {
  bg: "#F7F4EF",
  card: "#ffffff",
  text: "#111111",
  textMuted: "#4b5563",
  textSubtle: "#9ca3af",
  border: "#e5e7eb",
  borderSoft: "#f3f4f6",
  accentStart: "#FF8A1E",
  accentMid: "#FF4A1C",
  accentEnd: "#E8271C",
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Logo SVG inline — reproduit exactement le A dégradé orange→rouge avec
 * fenêtre 2x2 au centre. L'id de gradient est rendu unique par template
 * pour éviter tout conflit si 2 emails s'affichent côte à côte.
 */
function logoSvg(id: string, size = 44): string {
  const gradId = `nm-${id}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="${size}" height="${size}" role="img" aria-label="${escapeHtml(BRAND.name || "NestMatch")}" style="display:block;">
  <defs>
    <linearGradient id="${gradId}" x1="200" y1="60" x2="200" y2="340" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${PALETTE.accentStart}"/>
      <stop offset="55%" stop-color="${PALETTE.accentMid}"/>
      <stop offset="100%" stop-color="${PALETTE.accentEnd}"/>
    </linearGradient>
  </defs>
  <path d="M 105 325 L 200 95" stroke="url(#${gradId})" stroke-width="54" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M 200 95 L 295 325" stroke="url(#${gradId})" stroke-width="54" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <g fill="url(#${gradId})">
    <rect x="178" y="228" width="20" height="20" rx="4"/>
    <rect x="202" y="228" width="20" height="20" rx="4"/>
    <rect x="178" y="252" width="20" height="20" rx="4"/>
    <rect x="202" y="252" width="20" height="20" rx="4"/>
  </g>
</svg>`
}

function wrap(preview: string, body: string, templateId: string): string {
  const base = process.env.NEXT_PUBLIC_URL || BRAND.url || "https://nestmatch.fr"
  const domain = base.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(BRAND.name || "NestMatch")}</title>
</head>
<body style="background:${PALETTE.bg};margin:0;padding:0;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:${PALETTE.text};-webkit-font-smoothing:antialiased;">
  <!-- Preview text (affiché dans aperçu inbox avant ouverture) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PALETTE.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Carte principale -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${PALETTE.card};border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">

          <!-- Bande dégradée haut (accent marque) -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${PALETTE.accentStart} 0%,${PALETTE.accentMid} 50%,${PALETTE.accentEnd} 100%);line-height:4px;font-size:0;">&nbsp;</td>
          </tr>

          <!-- Header logo + nom -->
          <tr>
            <td align="center" style="padding:32px 28px 20px;">
              <a href="${base}" target="_blank" style="text-decoration:none;color:${PALETTE.text};display:inline-block;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="padding-right:10px;">${logoSvg(templateId, 40)}</td>
                    <td valign="middle" style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};">${escapeHtml(BRAND.name || "NestMatch")}</td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>

          <!-- Contenu -->
          <tr>
            <td style="padding:8px 40px 32px;font-size:15px;line-height:1.65;color:${PALETTE.text};">
              ${body}
            </td>
          </tr>

          <!-- Séparateur doux -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:${PALETTE.borderSoft};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer : lien vers le site + mention -->
          <tr>
            <td align="center" style="padding:22px 40px 32px;">
              <p style="font-size:12px;color:${PALETTE.textMuted};margin:0 0 14px;line-height:1.5;">
                Une plateforme locataire–propriétaire sans frais d'agence.
              </p>
              <a href="${base}" target="_blank" style="display:inline-block;color:${PALETTE.text};font-size:13px;font-weight:700;text-decoration:none;padding:9px 20px;border:1.5px solid ${PALETTE.border};border-radius:999px;">
                Visiter ${escapeHtml(BRAND.name || "NestMatch")}
              </a>
              <p style="font-size:11px;color:${PALETTE.textSubtle};margin:18px 0 0;line-height:1.5;">
                <a href="${base}" target="_blank" style="color:${PALETTE.textSubtle};text-decoration:none;">${escapeHtml(domain)}</a>
                &nbsp;·&nbsp;
                <a href="${base}/parametres?tab=compte" target="_blank" style="color:${PALETTE.textSubtle};text-decoration:underline;">Préférences de notifications</a>
              </p>
            </td>
          </tr>

        </table>

        <!-- Mention légale -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:20px;">
          <tr>
            <td align="center" style="padding:0 16px;">
              <p style="font-size:11px;color:${PALETTE.textSubtle};margin:0;line-height:1.5;">
                Vous recevez cet email car vous avez un compte ${escapeHtml(BRAND.name || "NestMatch")}.
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

/**
 * CTA principal : bouton avec dégradé de marque, coins pilule, ombre douce.
 * Table-based pour compat Outlook (les anchors CSS ne sont pas fiables).
 */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 8px;">
    <tr>
      <td align="center" style="background:linear-gradient(135deg,${PALETTE.accentStart} 0%,${PALETTE.accentMid} 50%,${PALETTE.accentEnd} 100%);border-radius:999px;box-shadow:0 4px 12px rgba(232,39,28,0.18);">
        <a href="${href}" target="_blank" style="display:inline-block;padding:14px 34px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.1px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`
}

// ─── Templates ───────────────────────────────────────────────────────────────

export function verifyEmailTemplate(params: { userName: string | null; verifyUrl: string }): { subject: string; html: string; text: string } {
  const greeting = params.userName ? `Bienvenue ${escapeHtml(params.userName)}` : "Bienvenue"
  const body = `
    <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">${greeting} 👋</h1>
    <p style="margin:0 0 6px;color:${PALETTE.textMuted};">Merci d'avoir créé ton compte. Il ne reste qu'à confirmer ton adresse email pour que tout soit actif.</p>
    <p style="margin:0 0 16px;color:${PALETTE.textMuted};font-size:13px;">Ce lien est valide <strong>24 heures</strong>.</p>
    ${button(params.verifyUrl, "Vérifier mon email")}
    <p style="margin:28px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br>
      <a href="${params.verifyUrl}" target="_blank" style="color:${PALETTE.textSubtle};word-break:break-all;">${escapeHtml(params.verifyUrl)}</a>
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:${PALETTE.textSubtle};">Si tu n'es pas à l'origine de cette inscription, ignore simplement cet email.</p>
  `
  const html = wrap("Confirme ton adresse email pour activer ton compte NestMatch.", body, "verify")
  const text = `${greeting} !

Merci d'avoir créé ton compte NestMatch. Confirme ton adresse email en cliquant sur le lien ci-dessous (valide 24h) :

${params.verifyUrl}

Si tu n'es pas à l'origine de cette inscription, ignore cet email.

— L'équipe NestMatch`
  return { subject: "Vérifie ton email — NestMatch", html, text }
}

export function resetPasswordTemplate(params: { resetUrl: string }): { subject: string; html: string; text: string } {
  const body = `
    <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">Réinitialise ton mot de passe</h1>
    <p style="margin:0 0 6px;color:${PALETTE.textMuted};">Quelqu'un (toi, on espère) a demandé à réinitialiser le mot de passe de ce compte.</p>
    <p style="margin:0 0 16px;color:${PALETTE.textMuted};font-size:13px;">Ce lien est valide <strong>1 heure</strong>.</p>
    ${button(params.resetUrl, "Choisir un nouveau mot de passe")}
    <p style="margin:28px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br>
      <a href="${params.resetUrl}" target="_blank" style="color:${PALETTE.textSubtle};word-break:break-all;">${escapeHtml(params.resetUrl)}</a>
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:${PALETTE.textSubtle};">Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe ne sera pas changé.</p>
  `
  const html = wrap("Un lien pour réinitialiser ton mot de passe NestMatch.", body, "reset")
  const text = `Réinitialise ton mot de passe NestMatch

Ouvre ce lien (valide 1h) pour définir un nouveau mot de passe :

${params.resetUrl}

Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe ne sera pas changé.

— L'équipe NestMatch`
  return { subject: "Réinitialise ton mot de passe — NestMatch", html, text }
}

export function newMessageTemplate(params: { fromName: string; previewText: string; convUrl: string }): { subject: string; html: string; text: string } {
  const preview = params.previewText.length > 160 ? params.previewText.slice(0, 160) + "…" : params.previewText
  const body = `
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 6px;line-height:1.3;">Nouveau message</h1>
    <p style="margin:0 0 20px;color:${PALETTE.textMuted};font-size:14px;">De la part de <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong></p>

    <!-- Bulle preview -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td style="background:${PALETTE.bg};border-left:3px solid ${PALETTE.accentMid};border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.6;color:${PALETTE.text};white-space:pre-wrap;">
          ${escapeHtml(preview)}
        </td>
      </tr>
    </table>

    ${button(params.convUrl, "Ouvrir la conversation")}

    <p style="margin:24px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Tu peux gérer la fréquence de ces emails depuis tes
      <a href="${process.env.NEXT_PUBLIC_URL || BRAND.url}/parametres?tab=compte" target="_blank" style="color:${PALETTE.textSubtle};">préférences de notifications</a>.
    </p>
  `
  const html = wrap(`${params.fromName} t'a envoyé un message sur NestMatch.`, body, "newmsg")
  const text = `Nouveau message de ${params.fromName}

${preview}

Ouvrir la conversation : ${params.convUrl}

— NestMatch`
  return { subject: `${params.fromName} t'a envoyé un message`, html, text }
}
