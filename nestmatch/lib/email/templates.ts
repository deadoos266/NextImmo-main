/**
 * Templates HTML pour les emails transactionnels KeyMatch.
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="${size}" height="${size}" role="img" aria-label="${escapeHtml(BRAND.name || "KeyMatch")}" style="display:block;">
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
  const base = process.env.NEXT_PUBLIC_URL || BRAND.url || "https://keymatch-immo.fr"
  const domain = base.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(BRAND.name || "KeyMatch")}</title>
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
                    <td valign="middle" style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};">${escapeHtml(BRAND.name || "KeyMatch")}</td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>

          <!-- Contenu -->
          <tr>
            <td style="padding:8px 40px 12px;font-size:15px;line-height:1.65;color:${PALETTE.text};">
              ${body}
            </td>
          </tr>

          <!-- Signature : visible sur chaque email envoye -->
          <tr>
            <td style="padding:8px 40px 24px;font-size:14px;line-height:1.6;color:${PALETTE.text};">
              <p style="margin:0 0 2px;color:${PALETTE.textMuted};">Cordialement,</p>
              <p style="margin:0;font-weight:800;letter-spacing:-0.2px;color:${PALETTE.text};">— L'équipe ${escapeHtml(BRAND.name || "KeyMatch")}</p>
              <p style="margin:4px 0 0;font-size:11px;color:${PALETTE.textSubtle};letter-spacing:0.2px;">Louer, sans intermédiaire.</p>
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
                Visiter ${escapeHtml(BRAND.name || "KeyMatch")}
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
                Vous recevez cet email car vous avez un compte ${escapeHtml(BRAND.name || "KeyMatch")}.
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

export function verifyEmailTemplate(params: { userName: string | null; verifyUrl: string; code?: string }): { subject: string; html: string; text: string } {
  const greeting = params.userName ? `Bienvenue ${escapeHtml(params.userName)}` : "Bienvenue"
  // Code OTP 6 chiffres : si fourni, on l'affiche en gros + lien fallback.
  const codeBlock = params.code
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:${PALETTE.bg};border:1.5px solid ${PALETTE.border};border-radius:14px;padding:22px 28px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:2px;">Code de vérification</p>
            <p style="margin:0;font-size:38px;font-weight:800;letter-spacing:8px;color:${PALETTE.text};font-family:'DM Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(params.code)}</p>
            <p style="margin:10px 0 0;font-size:11px;color:${PALETTE.textSubtle};">Valide 15 minutes</p>
          </div>
        </td>
      </tr>
    </table>
    `
    : ""
  const body = `
    <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">${greeting}</h1>
    <p style="margin:0 0 6px;color:${PALETTE.textMuted};">Merci d'avoir créé ton compte. Il ne reste qu'à confirmer ton adresse email pour que tout soit actif.</p>
    ${codeBlock}
    <p style="margin:18px 0 8px;color:${PALETTE.textMuted};font-size:13px;text-align:center;">Saisis ce code sur la page de vérification${params.code ? "" : " ou clique sur le bouton ci-dessous"}.</p>
    ${button(params.verifyUrl, params.code ? "Vérifier mon email" : "Vérifier mon email")}
    <p style="margin:20px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br>
      <a href="${params.verifyUrl}" target="_blank" style="color:${PALETTE.textSubtle};word-break:break-all;">${escapeHtml(params.verifyUrl)}</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:${PALETTE.textSubtle};">Si tu n'es pas à l'origine de cette inscription, ignore simplement cet email.</p>
  `
  const html = wrap("Confirme ton adresse email pour activer ton compte KeyMatch.", body, "verify")
  const text = `${greeting} !

Merci d'avoir créé ton compte KeyMatch.${params.code ? `

Ton code de vérification : ${params.code}
(valide 15 minutes)

Saisis-le sur : ${params.verifyUrl.replace(/\/api\/auth\/verify-email.*$/, "/auth/verifier-email")}` : ""}

Tu peux aussi cliquer sur ce lien :
${params.verifyUrl}

Si tu n'es pas à l'origine de cette inscription, ignore cet email.

— L'équipe KeyMatch`
  return { subject: "Vérifie ton email — KeyMatch", html, text }
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
  const html = wrap("Un lien pour réinitialiser ton mot de passe KeyMatch.", body, "reset")
  const text = `Réinitialise ton mot de passe KeyMatch

Ouvre ce lien (valide 1h) pour définir un nouveau mot de passe :

${params.resetUrl}

Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe ne sera pas changé.

— L'équipe KeyMatch`
  return { subject: "Réinitialise ton mot de passe — KeyMatch", html, text }
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
  const html = wrap(`${params.fromName} t'a envoyé un message sur KeyMatch.`, body, "newmsg")
  const text = `Nouveau message de ${params.fromName}

${preview}

Ouvrir la conversation : ${params.convUrl}

— KeyMatch`
  return { subject: `${params.fromName} t'a envoyé un message`, html, text }
}

export function candidatOrphelinTemplate(params: {
  bienTitre: string
  ville?: string | null
  annoncesUrl: string
}): { subject: string; html: string; text: string } {
  const contexte = params.ville
    ? `${escapeHtml(params.bienTitre)} à ${escapeHtml(params.ville)}`
    : escapeHtml(params.bienTitre)
  const body = `
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Votre candidature n'a pas été retenue
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Le propriétaire de <strong style="color:${PALETTE.text};">${contexte}</strong> a choisi un autre dossier. Ce n'est pas un jugement sur votre profil — la plupart des proprios doivent trancher entre plusieurs candidats solides.
    </p>
    <p style="margin:0 0 20px;color:${PALETTE.textMuted};line-height:1.65;">
      De nouvelles annonces qui correspondent à vos critères sont publiées chaque jour sur KeyMatch. On garde votre dossier complet pour les prochaines candidatures.
    </p>
    ${button(params.annoncesUrl, "Voir les annonces du moment")}
    <p style="margin:26px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Conseil : un dossier à jour avec présentation personnelle et 3+ quittances récentes augmente fortement vos chances sur les prochaines annonces.
    </p>
  `
  const html = wrap("Votre candidature n'a pas été retenue sur KeyMatch, voici les prochaines étapes.", body, "orphelin")
  const text = `Votre candidature n'a pas été retenue

Le propriétaire de ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""} a choisi un autre dossier. Ce n'est pas un jugement sur votre profil — la plupart des proprios tranchent entre plusieurs candidats solides.

De nouvelles annonces sont publiées chaque jour. Votre dossier reste complet pour les prochaines candidatures.

Voir les annonces : ${params.annoncesUrl}

— L'équipe KeyMatch`
  return {
    subject: "Votre candidature n'a pas été retenue — on garde votre dossier prêt",
    html,
    text,
  }
}

export function bailInvitationTemplate(params: {
  proprioName: string
  bienTitre: string
  ville: string | null
  loyerHC: number
  charges: number
  acceptUrl: string
  declineUrl: string
  expiresAt: string  // ex: "le 4 mai 2026"
  messageProprio?: string | null
}): { subject: string; html: string; text: string } {
  const contexte = params.ville
    ? `${escapeHtml(params.bienTitre)} à ${escapeHtml(params.ville)}`
    : escapeHtml(params.bienTitre)
  const totalCC = params.loyerHC + params.charges
  const messageBlock = params.messageProprio?.trim()
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;">
      <tr>
        <td style="background:${PALETTE.bg};border-left:3px solid ${PALETTE.accentMid};border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:${PALETTE.text};white-space:pre-wrap;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Mot de ${escapeHtml(params.proprioName)}</p>
          ${escapeHtml(params.messageProprio.trim())}
        </td>
      </tr>
    </table>
    `
    : ""
  const body = `
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Votre propriétaire vous invite sur KeyMatch
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.proprioName)}</strong> a importé votre bail pour <strong style="color:${PALETTE.text};">${contexte}</strong> sur KeyMatch et vous invite à le valider.
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      En acceptant, vous pourrez recevoir vos quittances de loyer en PDF chaque mois, signaler des entretiens et discuter avec votre propriétaire — gratuitement, sans frais d'agence.
    </p>

    ${messageBlock}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td style="background:${PALETTE.bg};border-radius:12px;padding:16px 18px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Loyer mensuel</p>
          <p style="margin:0 0 12px;font-size:15px;color:${PALETTE.text};">
            ${params.loyerHC.toLocaleString("fr-FR")} € hors charges
            ${params.charges > 0 ? ` <span style="color:${PALETTE.textSubtle};">+ ${params.charges.toLocaleString("fr-FR")} € charges</span>` : ""}
          </p>
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Total mensuel</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:${PALETTE.text};">${totalCC.toLocaleString("fr-FR")} € CC</p>
        </td>
      </tr>
    </table>

    ${button(params.acceptUrl, "Accepter et créer mon compte")}

    <p style="margin:14px 0 0;text-align:center;font-size:13px;">
      <a href="${params.declineUrl}" target="_blank" style="color:${PALETTE.textMuted};text-decoration:underline;">Ce n'est pas mon bail / refuser</a>
    </p>

    <p style="margin:26px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Cette invitation expire ${escapeHtml(params.expiresAt)}. Si vous n'êtes pas le ou la locataire concernée, cliquez simplement sur "refuser" — votre propriétaire en sera informé.
    </p>
  `
  const html = wrap(`${params.proprioName} vous invite à valider votre bail sur KeyMatch.`, body, "bailinvit")
  const text = `Bonjour,

${params.proprioName} a importé votre bail pour ${params.bienTitre}${params.ville ? " à " + params.ville : ""} sur KeyMatch et vous invite à le valider.

Loyer : ${params.loyerHC.toLocaleString("fr-FR")} € HC${params.charges > 0 ? ` + ${params.charges.toLocaleString("fr-FR")} € charges` : ""}
Total : ${totalCC.toLocaleString("fr-FR")} € CC

Accepter et créer mon compte : ${params.acceptUrl}

Ce n'est pas mon bail / refuser : ${params.declineUrl}

Cette invitation expire ${params.expiresAt}.

— L'équipe KeyMatch`
  return {
    subject: `${params.proprioName} vous invite sur KeyMatch — ${params.bienTitre}`,
    html,
    text,
  }
}

export function quittanceTemplate(params: {
  bienTitre: string
  ville?: string | null
  periode: string  // "septembre 2026"
  loyerCC: number
  pdfUrl: string
}): { subject: string; html: string; text: string } {
  const contexte = params.ville
    ? `${escapeHtml(params.bienTitre)} à ${escapeHtml(params.ville)}`
    : escapeHtml(params.bienTitre)
  const body = `
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Votre quittance de loyer est disponible
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Le propriétaire de <strong style="color:${PALETTE.text};">${contexte}</strong> a confirmé la réception de votre loyer pour <strong>${escapeHtml(params.periode)}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td style="background:${PALETTE.bg};border-left:3px solid ${PALETTE.accentMid};border-radius:12px;padding:16px 18px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Période concernée</p>
          <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${PALETTE.text};">${escapeHtml(params.periode)}</p>
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Total acquitté</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:${PALETTE.text};">${params.loyerCC.toLocaleString("fr-FR")} €</p>
        </td>
      </tr>
    </table>

    ${button(params.pdfUrl, "Télécharger la quittance (PDF)")}

    <p style="margin:24px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Conservez ce document : c'est votre preuve de paiement officielle. Vous le retrouverez aussi dans votre espace KeyMatch (Mes quittances).
    </p>
  `
  const html = wrap(`Quittance de loyer pour ${params.periode}`, body, "quittance")
  const text = `Bonjour,

Le propriétaire de ${params.bienTitre}${params.ville ? " à " + params.ville : ""} a confirmé la réception de votre loyer pour ${params.periode}.

Total acquitté : ${params.loyerCC.toLocaleString("fr-FR")} €

Téléchargez votre quittance (PDF) : ${params.pdfUrl}

Conservez ce document : c'est votre preuve de paiement officielle.

Cordialement,
— L'équipe KeyMatch
Louer, sans intermédiaire.`
  return {
    subject: `Quittance de loyer — ${params.periode}`,
    html,
    text,
  }
}

/**
 * V32.5 — Email envoyé aux 2 parties dès que le bail est pleinement signé
 * (locataire + bailleur). Audit produit V31 R1.5 : avant cette feature, le
 * succès de signature était silencieux côté locataire, créant le doute
 * "ça a marché ?". Cet email apporte la preuve écrite + le PDF en pièce jointe.
 */
export function bailFinalActifTemplate(params: {
  destinataireRole: "locataire" | "bailleur"
  bienTitre: string
  ville?: string | null
  dateDebut: string  // ISO
  dureeMois: number
  loyerCC: number
  nomLocataire: string
  nomBailleur: string
  signeAt: string  // ISO
  monLogementUrl: string
}): { subject: string; html: string; text: string } {
  const contexte = params.ville
    ? `${escapeHtml(params.bienTitre)} à ${escapeHtml(params.ville)}`
    : escapeHtml(params.bienTitre)
  const dateDebutFr = new Date(params.dateDebut).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  })
  const signeAtFr = new Date(params.signeAt).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  })
  const dureeAns = params.dureeMois >= 12
    ? `${Math.round(params.dureeMois / 12)} an${params.dureeMois >= 24 ? "s" : ""}`
    : `${params.dureeMois} mois`
  const intro = params.destinataireRole === "locataire"
    ? `Votre bail pour <strong style="color:${PALETTE.text};">${contexte}</strong> est désormais signé par les deux parties.`
    : `Le bail pour <strong style="color:${PALETTE.text};">${contexte}</strong> a été contresigné par le locataire ${escapeHtml(params.nomLocataire)}.`
  const nextStep = params.destinataireRole === "locataire"
    ? "Prochaine étape : l'état des lieux d'entrée avec votre propriétaire."
    : "Prochaine étape : créer l'état des lieux d'entrée avec votre locataire."

  const body = `
    <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      ✓ Votre bail KeyMatch est actif
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      ${intro}
    </p>
    <p style="margin:0 0 18px;color:${PALETTE.textMuted};line-height:1.65;">
      Le PDF complet du bail signé est joint à cet email — conservez-le précieusement, c'est votre preuve juridique.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr>
        <td style="background:${PALETTE.bg};border-radius:12px;padding:16px 18px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Locataire</p>
          <p style="margin:0 0 10px;font-size:14px;color:${PALETTE.text};">${escapeHtml(params.nomLocataire)}</p>
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Bailleur</p>
          <p style="margin:0 0 10px;font-size:14px;color:${PALETTE.text};">${escapeHtml(params.nomBailleur)}</p>
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Date de prise d'effet</p>
          <p style="margin:0 0 10px;font-size:14px;color:${PALETTE.text};">${dateDebutFr} (${escapeHtml(dureeAns)})</p>
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Loyer charges comprises</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:${PALETTE.text};">${params.loyerCC.toLocaleString("fr-FR")} €/mois</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;color:${PALETTE.text};font-size:14px;line-height:1.65;">
      <strong>${nextStep}</strong>
    </p>

    ${button(params.monLogementUrl, params.destinataireRole === "locataire" ? "Voir mon logement" : "Démarrer l'état des lieux")}

    <p style="margin:26px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Bail signé électroniquement le ${signeAtFr}, conformément à l'article 1366 du Code civil
      et au règlement européen eIDAS (UE 910/2014). Toutes les signatures sont horodatées,
      géolocalisées (adresse IP) et archivées dans nos systèmes.
    </p>
  `
  const html = wrap("Votre bail KeyMatch est désormais actif.", body, "bailfinal")
  const text = `Bonjour,

${params.destinataireRole === "locataire"
  ? `Votre bail pour ${params.bienTitre}${params.ville ? " à " + params.ville : ""} est désormais signé par les deux parties.`
  : `Le bail pour ${params.bienTitre}${params.ville ? " à " + params.ville : ""} a été contresigné par le locataire ${params.nomLocataire}.`}

Le PDF complet du bail signé est joint à cet email — conservez-le, c'est votre preuve juridique.

Locataire : ${params.nomLocataire}
Bailleur : ${params.nomBailleur}
Date de prise d'effet : ${dateDebutFr} (${dureeAns})
Loyer CC : ${params.loyerCC.toLocaleString("fr-FR")} €/mois

${nextStep}
${params.monLogementUrl}

Bail signé électroniquement le ${signeAtFr}, conformément à l'article 1366 du Code civil et au règlement eIDAS.

— L'équipe KeyMatch
Louer, sans intermédiaire.`
  return {
    subject: `✓ Votre bail KeyMatch est actif — ${params.bienTitre}`,
    html,
    text,
  }
}

/**
 * V34.1 — Rappel proprio→locataire de signer un bail envoyé.
 * Migré depuis /api/bail/relance (V32.6 inline → template rebrandé KeyMatch).
 */
export function bailRelanceLocataireTemplate(params: {
  proprioName: string
  bienTitre: string
  ville: string | null
  loyerCC: number
  jours: number
  signUrl: string
}): { subject: string; html: string; text: string } {
  const contexte = params.ville ? `${escapeHtml(params.bienTitre)} à ${escapeHtml(params.ville)}` : escapeHtml(params.bienTitre)
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Rappel : votre bail attend votre signature
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Il y a <strong style="color:${PALETTE.text};">${params.jours} jour${params.jours > 1 ? "s" : ""}</strong>, ${escapeHtml(params.proprioName)} vous a envoyé le bail pour <strong style="color:${PALETTE.text};">${contexte}</strong>. Il n'est pas encore signé.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td style="background:${PALETTE.bg};border-radius:12px;padding:14px 18px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PALETTE.textSubtle};text-transform:uppercase;letter-spacing:1px;">Loyer charges comprises</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:${PALETTE.text};">${params.loyerCC.toLocaleString("fr-FR")} €/mois</p>
        </td>
      </tr>
    </table>
    ${button(params.signUrl, "Signer le bail maintenant →")}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Si vous avez changé d'avis ou si ce bail ne vous concerne plus, contactez votre propriétaire via la messagerie KeyMatch.
    </p>
  `
  const html = wrap("Rappel : votre bail KeyMatch attend votre signature.", body, "bailrelancloc")
  const text = `Rappel : votre bail KeyMatch attend votre signature.

Il y a ${params.jours} jour${params.jours > 1 ? "s" : ""}, ${params.proprioName} vous a envoyé le bail pour ${params.bienTitre}${params.ville ? " à " + params.ville : ""}. Il n'est pas encore signé.

Loyer CC : ${params.loyerCC.toLocaleString("fr-FR")} €/mois

Signer le bail maintenant : ${params.signUrl}

— L'équipe KeyMatch`
  return {
    subject: `Rappel : votre bail KeyMatch attend votre signature — ${params.bienTitre}`,
    html,
    text,
  }
}

/**
 * V34.1 — Rappel locataire→proprio (envoi du bail OU contresignature).
 * Migré depuis /api/bail/relance-bailleur (V33.4 inline → template rebrandé).
 */
export function bailRelanceProprioTemplate(params: {
  locataireName: string
  bienTitre: string
  ville: string | null
  contexte: "envoi" | "contresignature"
  jours: number
  ctaUrl: string
}): { subject: string; html: string; text: string } {
  const ctxLabel = params.ville ? `${escapeHtml(params.bienTitre)} à ${escapeHtml(params.ville)}` : escapeHtml(params.bienTitre)
  const intro = params.contexte === "envoi"
    ? `<strong style="color:${PALETTE.text};">${escapeHtml(params.locataireName)}</strong> a accepté votre invitation pour <strong style="color:${PALETTE.text};">${ctxLabel}</strong> il y a ${params.jours} jour${params.jours > 1 ? "s" : ""} et attend que vous lui envoyiez le bail.`
    : `<strong style="color:${PALETTE.text};">${escapeHtml(params.locataireName)}</strong> a signé le bail pour <strong style="color:${PALETTE.text};">${ctxLabel}</strong> il y a ${params.jours} jour${params.jours > 1 ? "s" : ""} et attend votre contresignature.`
  const ctaLabel = params.contexte === "envoi" ? "Générer et envoyer le bail →" : "Voir le bail à signer →"
  const subject = params.contexte === "envoi"
    ? `Rappel : ${params.locataireName} attend le bail — ${params.bienTitre}`
    : `Rappel : ${params.locataireName} attend votre contresignature — ${params.bienTitre}`

  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Votre locataire vous attend
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">${intro}</p>
    ${button(params.ctaUrl, ctaLabel)}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Vous recevez ce rappel parce que votre locataire l'a déclenché manuellement depuis son espace KeyMatch.
    </p>
  `
  const html = wrap(`${params.locataireName} vous attend pour avancer sur le bail.`, body, "bailrelanceprop")
  const text = `Rappel locataire :

${intro.replace(/<[^>]+>/g, "")}

Lien : ${params.ctaUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

// ─── V52 — Visite + Dossier + Bail signature partial ────────────────────────

function escapeBienTitre(titre: string, ville: string | null) {
  return ville ? `${escapeHtml(titre)} à ${escapeHtml(ville)}` : escapeHtml(titre)
}

function formatSlotsHtml(slots: Array<{ date: string; heure: string }>) {
  if (!slots.length) return ""
  return `<ul style="margin:8px 0 14px;padding-left:20px;color:${PALETTE.textMuted};line-height:1.7;">
    ${slots.map(s => {
      const d = new Date(`${s.date}T${s.heure || "00:00"}`)
      const txt = isNaN(d.getTime())
        ? `${escapeHtml(s.date)} à ${escapeHtml(s.heure || "")}`
        : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + ` à ${escapeHtml(s.heure || "")}`
      return `<li>${txt}</li>`
    }).join("")}
  </ul>`
}

/**
 * V52.1 — Visite proposée (proprio→locataire OU locataire→proprio en
 * contre-proposition). N créneaux possibles, format physique/visio.
 */
export function visiteProposeeTemplate(params: {
  fromName: string
  bienTitre: string
  ville: string | null
  slots: Array<{ date: string; heure: string }>
  format: "physique" | "visio"
  message?: string | null
  convUrl: string
  isCounter?: boolean
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const formatLabel = params.format === "visio" ? "en visio" : "physique"
  const counterLabel = params.isCounter ? "contre-propose" : "propose"
  const subject = `${params.fromName} vous ${counterLabel} ${params.slots.length > 1 ? `${params.slots.length} créneaux` : "un créneau"} de visite — ${params.bienTitre}`
  const introVerb = params.isCounter ? "vous contre-propose" : "vous propose"
  const slotsLabel = params.slots.length > 1
    ? `${params.slots.length} créneaux au choix`
    : "un créneau"
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Demande de visite${params.isCounter ? " (contre-proposition)" : ""}
    </h1>
    <p style="margin:0 0 8px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong>
      ${introVerb} ${slotsLabel} pour <strong style="color:${PALETTE.text};">${titreLabel}</strong>
      <span style="color:${PALETTE.textSubtle};"> · ${formatLabel}</span>.
    </p>
    ${formatSlotsHtml(params.slots)}
    ${params.message ? `<blockquote style="margin:14px 0;padding:12px 16px;background:${PALETTE.bg};border-left:3px solid ${PALETTE.accentMid};border-radius:6px;color:${PALETTE.textMuted};font-style:italic;">${escapeHtml(params.message)}</blockquote>` : ""}
    ${button(params.convUrl, params.isCounter ? "Voir la contre-proposition →" : "Choisir un créneau →")}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Vous recevez cet email parce qu'une demande de visite vous concerne.
    </p>
  `
  const html = wrap(`${params.fromName} ${introVerb} ${slotsLabel} de visite.`, body, "visiteprop")
  const text = `${params.fromName} ${introVerb} ${slotsLabel} pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""} (${formatLabel}).

${params.slots.map(s => `- ${s.date} à ${s.heure}`).join("\n")}
${params.message ? `\n"${params.message}"\n` : ""}

Répondre : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V52.2 — Visite confirmée. Locataire a retenu un slot proposé par le proprio
 * (ou inverse). Email aux 2 parties.
 */
export function visiteConfirmeeTemplate(params: {
  bienTitre: string
  ville: string | null
  date: string
  heure: string
  format: "physique" | "visio"
  destinataireRole: "locataire" | "proprietaire"
  convUrl: string
  adresse?: string | null
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const formatLabel = params.format === "visio" ? "en visio" : "physique"
  const d = new Date(`${params.date}T${params.heure || "00:00"}`)
  const dateLong = isNaN(d.getTime())
    ? `${params.date} à ${params.heure}`
    : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + ` à ${params.heure}`
  const subject = `Visite confirmée — ${params.bienTitre} le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à ${params.heure}`
  const greet = params.destinataireRole === "locataire"
    ? "Votre visite est confirmée."
    : "Une visite est confirmée pour votre bien."
  const adresseBlock = params.adresse
    ? `<p style="margin:6px 0 14px;color:${PALETTE.textMuted};">📍 ${escapeHtml(params.adresse)}</p>`
    : ""
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      ${greet}
    </h1>
    <p style="margin:0 0 6px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>
    </p>
    <p style="margin:0 0 6px;color:${PALETTE.text};font-size:17px;font-weight:600;">
      ${escapeHtml(dateLong)}
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textSubtle};">${formatLabel}</p>
    ${adresseBlock}
    ${button(params.convUrl, "Voir la conversation →")}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      ${params.format === "physique" ? "Pensez à confirmer le rendez-vous la veille." : "Le lien de visio sera partagé dans la conversation."}
    </p>
  `
  const html = wrap(`Visite confirmée le ${dateLong}.`, body, "visiteconf")
  const text = `Visite confirmée

${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}
${dateLong}
${formatLabel}${params.adresse ? `\n${params.adresse}` : ""}

Conversation : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V52.3 — Visite annulée par l'une des 2 parties.
 */
export function visiteAnnuleeTemplate(params: {
  fromName: string
  bienTitre: string
  ville: string | null
  date: string
  heure: string
  raison?: string | null
  convUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const d = new Date(`${params.date}T${params.heure || "00:00"}`)
  const dateLong = isNaN(d.getTime())
    ? `${params.date} à ${params.heure}`
    : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + ` à ${params.heure}`
  const subject = `Visite annulée — ${params.bienTitre}`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Visite annulée
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> a annulé la visite prévue le
      <strong style="color:${PALETTE.text};">${escapeHtml(dateLong)}</strong> pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    ${params.raison ? `<blockquote style="margin:14px 0;padding:12px 16px;background:${PALETTE.bg};border-left:3px solid ${PALETTE.border};border-radius:6px;color:${PALETTE.textMuted};font-style:italic;">${escapeHtml(params.raison)}</blockquote>` : ""}
    ${button(params.convUrl, "Reprendre contact →")}
  `
  const html = wrap(`Visite du ${dateLong} annulée.`, body, "visiteannul")
  const text = `Visite annulée

${params.fromName} a annulé la visite prévue le ${dateLong} pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.${params.raison ? `\n\nRaison : ${params.raison}` : ""}

Conversation : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V52.4 — Demande de dossier (proprio → locataire).
 */
export function dossierDemandeTemplate(params: {
  fromName: string
  bienTitre: string
  ville: string | null
  convUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const subject = `${params.fromName} vous demande votre dossier — ${params.bienTitre}`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Votre dossier est demandé
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> souhaite consulter votre dossier locataire pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Votre dossier est partagé via un lien sécurisé valable 30 jours, que vous pouvez révoquer à tout moment depuis vos paramètres.
    </p>
    ${button(params.convUrl, "Envoyer mon dossier →")}
  `
  const html = wrap(`${params.fromName} demande votre dossier.`, body, "dossierdemande")
  const text = `${params.fromName} demande votre dossier pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.

Lien sécurisé valable 30 jours, révocable à tout moment.

Répondre : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V52.5 — Dossier partagé (locataire → proprio).
 */
export function dossierPartageTemplate(params: {
  fromName: string
  bienTitre: string
  ville: string | null
  score: number | null
  shareUrl: string | null
  convUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const subject = `${params.fromName} a partagé son dossier — ${params.bienTitre}`
  const scoreLine = typeof params.score === "number"
    ? `<p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">Score de complétude : <strong style="color:${PALETTE.text};">${params.score}%</strong></p>`
    : ""
  const cta = params.shareUrl || params.convUrl
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Nouveau dossier reçu
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> vient de partager son dossier pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    ${scoreLine}
    ${button(cta, "Consulter le dossier →")}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Lien sécurisé chiffré, valable 30 jours. Le candidat peut le révoquer à tout moment.
    </p>
  `
  const html = wrap(`${params.fromName} a partagé son dossier.`, body, "dossierpart")
  const text = `${params.fromName} a partagé son dossier pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.${typeof params.score === "number" ? `\nScore : ${params.score}%` : ""}

Consulter : ${cta}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V52.6 — Dossier révoqué par le locataire (proprio averti).
 */
export function dossierRevoqueTemplate(params: {
  fromName: string
  bienTitre: string | null
  ville: string | null
  convUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = params.bienTitre ? escapeBienTitre(params.bienTitre, params.ville) : "votre échange"
  const subject = `${params.fromName} a révoqué l'accès à son dossier`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Accès au dossier révoqué
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> a révoqué l'accès au dossier qu'il/elle vous avait partagé pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Vous pouvez en redemander un en répondant dans la conversation.
    </p>
    ${button(params.convUrl, "Voir la conversation →")}
  `
  const html = wrap(`${params.fromName} a révoqué l'accès à son dossier.`, body, "dossierrevoq")
  const text = `${params.fromName} a révoqué l'accès au dossier qu'il/elle vous avait partagé.

Conversation : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

// ─── V53 — EDL + Candidature + Loyers retard + IRL + Préavis ─────────────────

/**
 * V53.2 — État des lieux à signer (proprio→locataire).
 */
export function edlASignerTemplate(params: {
  fromName: string
  bienTitre: string
  ville: string | null
  edlType: "entree" | "sortie"
  consultUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const typeLabel = params.edlType === "entree" ? "d'entrée" : "de sortie"
  const subject = `${params.fromName} a partagé l'état des lieux ${typeLabel} — ${params.bienTitre}`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      État des lieux ${typeLabel} à valider
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> a préparé l'état des lieux ${typeLabel} pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>. Consultez le détail des pièces, les photos, et signez si tout est conforme.
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Si une observation est nécessaire (état d'une pièce, équipement manquant…), vous pourrez ajouter un commentaire avant de signer.
    </p>
    ${button(params.consultUrl, `Consulter et signer →`)}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Document légal — signature électronique conforme eIDAS Niveau 1.
    </p>
  `
  const html = wrap(`${params.fromName} a partagé l'EDL ${typeLabel}.`, body, "edlasigner")
  const text = `${params.fromName} a partagé l'état des lieux ${typeLabel} pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.

Consultez et signez : ${params.consultUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.4 — Candidature validée (proprio→locataire).
 */
export function candidatureValideeTemplate(params: {
  proprioName: string
  bienTitre: string
  ville: string | null
  convUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const subject = `Bonne nouvelle ! Votre candidature est validée — ${params.bienTitre}`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Votre candidature est validée
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.proprioName)}</strong> a validé votre candidature pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Vous pouvez maintenant proposer un créneau de visite directement depuis la conversation, ou attendre une proposition du propriétaire.
    </p>
    ${button(params.convUrl, "Voir la conversation →")}
  `
  const html = wrap(`Votre candidature pour ${titreLabel} est validée.`, body, "candvalidee")
  const text = `Bonne nouvelle ! ${params.proprioName} a validé votre candidature pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.

Vous pouvez proposer une visite ou attendre sa proposition.

Conversation : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.7 — Candidature non retenue (proprio→locataire) avec recommandations.
 */
export function candidatureRefuseeTemplate(params: {
  proprioName: string
  bienTitre: string
  ville: string | null
  raison?: string | null
  recommandations: Array<{ id: number | string; titre: string; ville: string | null; prix: number | null; href: string }>
  searchUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const subject = `${params.bienTitre} : votre candidature n'a pas été retenue`
  const recoBlock = params.recommandations.length > 0
    ? `<div style="margin:14px 0 4px;font-size:13px;font-weight:700;color:${PALETTE.text};letter-spacing:-0.1px;">D'autres logements qui pourraient vous intéresser</div>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 14px;">
         ${params.recommandations.slice(0, 5).map(r => `
           <tr><td style="padding:8px 0;border-top:1px solid ${PALETTE.borderSoft};">
             <a href="${r.href}" target="_blank" style="text-decoration:none;color:${PALETTE.text};">
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                 <tr>
                   <td valign="middle" style="font-size:14px;font-weight:600;color:${PALETTE.text};">${escapeHtml(r.titre)}</td>
                   <td valign="middle" align="right" style="font-size:13px;color:${PALETTE.textMuted};white-space:nowrap;padding-left:12px;">${typeof r.prix === "number" ? `${r.prix.toLocaleString("fr-FR")} €` : ""}</td>
                 </tr>
                 ${r.ville ? `<tr><td colspan="2" style="font-size:12px;color:${PALETTE.textSubtle};padding-top:2px;">${escapeHtml(r.ville)}</td></tr>` : ""}
               </table>
             </a>
           </td></tr>
         `).join("")}
       </table>`
    : ""
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Candidature non retenue
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Désolé, <strong style="color:${PALETTE.text};">${escapeHtml(params.proprioName)}</strong> n'a pas retenu votre candidature pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    ${params.raison ? `<blockquote style="margin:14px 0;padding:12px 16px;background:${PALETTE.bg};border-left:3px solid ${PALETTE.border};border-radius:6px;color:${PALETTE.textMuted};font-style:italic;">${escapeHtml(params.raison)}</blockquote>` : ""}
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Cela ne veut pas dire que la prochaine ne marchera pas. Voici quelques annonces qui correspondent à vos critères :
    </p>
    ${recoBlock}
    ${button(params.searchUrl, "Continuer ma recherche →")}
  `
  const html = wrap(`Candidature non retenue — voici 5 alternatives.`, body, "candrefus")
  const text = `Désolé, ${params.proprioName} n'a pas retenu votre candidature pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.${params.raison ? `\n\nRaison : ${params.raison}` : ""}

Continuer votre recherche : ${params.searchUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.5 — Digest quotidien des candidatures reçues (proprio).
 */
export function candidaturesDigestTemplate(params: {
  proprioName: string
  candidatures: Array<{ candidatName: string; bienTitre: string; ville: string | null; score: number | null; href: string }>
  dashboardUrl: string
}): { subject: string; html: string; text: string } {
  const n = params.candidatures.length
  const subject = n === 1
    ? `1 nouvelle candidature reçue hier`
    : `${n} nouvelles candidatures reçues hier`
  const items = params.candidatures.slice(0, 10).map(c => `
    <tr><td style="padding:10px 0;border-top:1px solid ${PALETTE.borderSoft};">
      <a href="${c.href}" target="_blank" style="text-decoration:none;color:${PALETTE.text};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td valign="middle" style="font-size:14px;font-weight:600;color:${PALETTE.text};">${escapeHtml(c.candidatName)}</td>
            <td valign="middle" align="right" style="font-size:11px;color:${PALETTE.textSubtle};font-weight:700;letter-spacing:1px;text-transform:uppercase;padding-left:12px;">${typeof c.score === "number" ? `${c.score}% match` : ""}</td>
          </tr>
          <tr><td colspan="2" style="font-size:12px;color:${PALETTE.textMuted};padding-top:2px;">${escapeHtml(c.bienTitre)}${c.ville ? ` · ${escapeHtml(c.ville)}` : ""}</td></tr>
        </table>
      </a>
    </td></tr>
  `).join("")
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      ${n === 1 ? "Une nouvelle candidature" : `${n} nouvelles candidatures`}
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Voici le récapitulatif des candidatures reçues sur vos annonces dans les dernières 24 heures.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 14px;">
      ${items}
    </table>
    ${button(params.dashboardUrl, "Voir mon tableau de bord →")}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Récap envoyé une fois par jour. Vous pouvez désactiver ces digests dans vos préférences.
    </p>
  `
  const html = wrap(subject, body, "canddigest")
  const text = `${subject}

${params.candidatures.slice(0, 10).map(c => `- ${c.candidatName} — ${c.bienTitre}${c.ville ? ` · ${c.ville}` : ""}${typeof c.score === "number" ? ` (${c.score}%)` : ""}`).join("\n")}

Tableau de bord : ${params.dashboardUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.3 — Loyer en retard (J+5) — locataire.
 */
export function loyerRetardLocataireTemplate(params: {
  bienTitre: string
  ville: string | null
  mois: string  // "YYYY-MM"
  montant: number
  jours: number
  ctaUrl: string
  isFinal?: boolean // true = J+15
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const moisLabel = (() => {
    const [y, m] = params.mois.split("-").map(Number)
    if (!y || !m) return params.mois
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  })()
  const subject = params.isFinal
    ? `Action requise — votre loyer ${moisLabel} est en retard de ${params.jours} jours`
    : `Rappel : votre loyer ${moisLabel} est en retard`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      ${params.isFinal ? "Loyer en retard depuis " + params.jours + " jours" : "Rappel : votre loyer est en retard"}
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Le loyer de ${escapeHtml(moisLabel)} pour <strong style="color:${PALETTE.text};">${titreLabel}</strong>
      (${params.montant.toLocaleString("fr-FR")} €) n'a pas encore été marqué comme payé.
    </p>
    ${params.isFinal ? `
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Si vous avez déjà réglé, contactez votre propriétaire pour qu'il confirme la réception. À défaut, une procédure de recouvrement peut être engagée.
    </p>` : `
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Si vous avez déjà réglé, votre propriétaire confirmera bientôt la réception et vous recevrez votre quittance. Sinon, vous pouvez ouvrir une discussion directement.
    </p>`}
    ${button(params.ctaUrl, "Contacter mon propriétaire →")}
  `
  const html = wrap(subject, body, "loyerretardloc")
  const text = `${subject}

Loyer ${moisLabel} pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""} : ${params.montant.toLocaleString("fr-FR")} €

Contacter le propriétaire : ${params.ctaUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.3 — Loyer en retard (J+5) — proprio.
 */
export function loyerRetardProprioTemplate(params: {
  locataireName: string
  bienTitre: string
  ville: string | null
  mois: string
  montant: number
  jours: number
  ctaUrl: string
  isFinal?: boolean
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const moisLabel = (() => {
    const [y, m] = params.mois.split("-").map(Number)
    if (!y || !m) return params.mois
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  })()
  const subject = params.isFinal
    ? `Action requise — loyer ${moisLabel} en retard de ${params.jours} jours (${params.bienTitre})`
    : `Loyer ${moisLabel} en retard — ${params.bienTitre}`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      ${params.isFinal ? "Loyer toujours impayé après " + params.jours + " jours" : "Loyer en retard"}
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.locataireName)}</strong> n'a pas encore réglé le loyer de ${escapeHtml(moisLabel)} pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong> (${params.montant.toLocaleString("fr-FR")} €).
    </p>
    ${params.isFinal ? `
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Si le retard se prolonge, vous pouvez engager une procédure : lettre de mise en demeure, puis commandement de payer par huissier.
      Pensez à dialoguer d'abord — un retard ponctuel se règle souvent par un échange direct.
    </p>` : `
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Si le paiement vient d'arriver, marquez-le comme reçu pour générer la quittance. Sinon, contactez le locataire pour faire le point.
    </p>`}
    ${button(params.ctaUrl, "Voir mes loyers →")}
  `
  const html = wrap(subject, body, "loyerretardprop")
  const text = `${subject}

${params.locataireName} — ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}
${moisLabel} : ${params.montant.toLocaleString("fr-FR")} € — retard ${params.jours} jours

Voir mes loyers : ${params.ctaUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.6 — Rappel J-1 visite (les 2 parties).
 */
export function visiteRappelTemplate(params: {
  bienTitre: string
  ville: string | null
  date: string
  heure: string
  format: "physique" | "visio"
  destinataireRole: "locataire" | "proprietaire"
  adresse?: string | null
  convUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const formatLabel = params.format === "visio" ? "en visio" : "physique"
  const d = new Date(`${params.date}T${params.heure || "00:00"}`)
  const dateLong = isNaN(d.getTime())
    ? `${params.date} à ${params.heure}`
    : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + ` à ${params.heure}`
  const subject = `Rappel : visite demain à ${params.heure} — ${params.bienTitre}`
  const adresseBlock = params.adresse
    ? `<p style="margin:6px 0 14px;color:${PALETTE.textMuted};">📍 ${escapeHtml(params.adresse)}</p>`
    : ""
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Rappel : visite demain
    </h1>
    <p style="margin:0 0 6px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>
    </p>
    <p style="margin:0 0 6px;color:${PALETTE.text};font-size:17px;font-weight:600;">
      ${escapeHtml(dateLong)}
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textSubtle};">${formatLabel}</p>
    ${adresseBlock}
    ${button(params.convUrl, "Voir la conversation →")}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      ${params.format === "physique" ? "Pensez à confirmer le rendez-vous si besoin." : "Le lien de visio est partagé dans la conversation."}
      Si vous devez annuler, faites-le maintenant pour libérer le créneau.
    </p>
  `
  const html = wrap(`Rappel : visite demain à ${params.heure}.`, body, "visiterappel")
  const text = `Rappel : visite demain

${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}
${dateLong}
${formatLabel}${params.adresse ? `\n${params.adresse}` : ""}

Conversation : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.8 — Indexation IRL trimestrielle (proprio).
 */
export function irlIndexationProposalTemplate(params: {
  bienTitre: string
  ville: string | null
  loyerActuelCC: number
  trimestre: string  // ex. "T1 2026"
  ctaUrl: string
  delaiAnniv: number  // jours avant ou après l'anniv
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const subject = `Indice IRL ${params.trimestre} publié — révisez votre loyer`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Indice IRL ${escapeHtml(params.trimestre)} publié
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      L'INSEE vient de publier l'indice IRL du ${escapeHtml(params.trimestre)}. C'est l'indice de référence pour réviser votre loyer.
      L'anniversaire de votre bail pour <strong style="color:${PALETTE.text};">${titreLabel}</strong> approche
      ${params.delaiAnniv >= 0 ? `(dans ${params.delaiAnniv} jours)` : `(il y a ${Math.abs(params.delaiAnniv)} jours)`}.
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Loyer actuel : <strong style="color:${PALETTE.text};">${params.loyerActuelCC.toLocaleString("fr-FR")} € CC</strong>.
      Le calcul exact se fait automatiquement avec l'indice publié.
    </p>
    ${button(params.ctaUrl, "Indexer le loyer maintenant →")}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Indexation conforme loi ALUR / loi du 6 juillet 1989. Vous pouvez aussi décider de ne pas réviser cette année — c'est votre choix.
    </p>
  `
  const html = wrap(`Nouvel indice IRL ${params.trimestre} — révisez votre loyer.`, body, "irlindex")
  const text = `Indice IRL ${params.trimestre} publié.

${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}
Loyer actuel : ${params.loyerActuelCC.toLocaleString("fr-FR")} € CC.

Indexer maintenant : ${params.ctaUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.9 — Préavis donné (rebrand V34.1, remplace HTML inline de /api/bail/preavis).
 */
export function preavisDonneTemplate(params: {
  qui: "locataire" | "proprietaire" | "bailleur"
  fromName: string
  bienTitre: string
  ville: string | null
  motifLabel: string
  detail?: string | null
  dateFinFr: string
  delaiMois: number
  bonus?: string | null
  convUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const intro = params.qui === "locataire"
    ? `Votre locataire <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> a donné congé pour <strong style="color:${PALETTE.text};">${titreLabel}</strong>.`
    : `Votre bailleur <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> a donné congé pour <strong style="color:${PALETTE.text};">${titreLabel}</strong>.`
  const subject = params.qui === "locataire"
    ? `Le locataire a donné congé — ${params.bienTitre}`
    : `Votre bailleur a donné congé — ${params.bienTitre}`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      Préavis reçu
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">${intro}</p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">Motif :</strong> ${escapeHtml(params.motifLabel)}
      ${params.detail ? `<br/><strong style="color:${PALETTE.text};">Précisions :</strong> ${escapeHtml(params.detail)}` : ""}
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Préavis légal : <strong style="color:${PALETTE.text};">${params.delaiMois} mois</strong>.<br/>
      Fin de bail effective : <strong style="color:${PALETTE.text};">${escapeHtml(params.dateFinFr)}</strong>.
    </p>
    ${params.bonus ? `<p style="margin:0 0 14px;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">${escapeHtml(params.bonus)}</p>` : ""}
    ${button(params.convUrl, "Ouvrir la conversation →")}
  `
  const html = wrap(`Préavis : fin de bail prévue le ${params.dateFinFr}.`, body, "preavis")
  const text = `Préavis reçu

${intro.replace(/<[^>]+>/g, "")}

Motif : ${params.motifLabel}${params.detail ? `\nPrécisions : ${params.detail}` : ""}
Préavis : ${params.delaiMois} mois
Fin de bail : ${params.dateFinFr}${params.bonus ? `\n\n${params.bonus}` : ""}

Conversation : ${params.convUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V53.10 — EDL contesté (locataire→proprio).
 */
export function edlContesteTemplate(params: {
  fromName: string
  bienTitre: string
  ville: string | null
  edlType: "entree" | "sortie"
  motif?: string | null
  consultUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const typeLabel = params.edlType === "entree" ? "d'entrée" : "de sortie"
  const subject = `${params.fromName} a contesté l'état des lieux ${typeLabel} — ${params.bienTitre}`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      EDL ${typeLabel} contesté
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.fromName)}</strong> a contesté l'état des lieux ${typeLabel} pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    ${params.motif ? `<blockquote style="margin:14px 0;padding:12px 16px;background:${PALETTE.bg};border-left:3px solid ${PALETTE.accentMid};border-radius:6px;color:${PALETTE.textMuted};font-style:italic;">${escapeHtml(params.motif)}</blockquote>` : ""}
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      Consultez les observations détaillées et ajustez l'EDL si besoin avant la signature finale.
    </p>
    ${button(params.consultUrl, "Voir la contestation →")}
  `
  const html = wrap(`${params.fromName} a contesté l'EDL ${typeLabel}.`, body, "edlconteste")
  const text = `${params.fromName} a contesté l'état des lieux ${typeLabel} pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.${params.motif ? `\n\nMotif : ${params.motif}` : ""}

Consulter : ${params.consultUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}

/**
 * V52.7 — Bail signé par 1 partie (notif l'autre partie).
 * Avant V52, cet event ne déclenchait qu'une notif in-app — l'autre partie
 * devait ouvrir l'app pour le savoir. Maintenant email + CTA "Signer".
 */
export function bailSignePartialTemplate(params: {
  signataireRole: "locataire" | "bailleur"
  signataireName: string
  bienTitre: string
  ville: string | null
  destinataireRole: "locataire" | "bailleur"
  ctaUrl: string
}): { subject: string; html: string; text: string } {
  const titreLabel = escapeBienTitre(params.bienTitre, params.ville)
  const signRoleLabel = params.signataireRole === "bailleur" ? "Le bailleur" : "Le locataire"
  const signRoleAction = params.destinataireRole === "bailleur"
    ? "Contre-signer le bail →"
    : "Signer le bail →"
  const subject = params.destinataireRole === "bailleur"
    ? `${signRoleLabel} a signé — à votre tour de contre-signer (${params.bienTitre})`
    : `${signRoleLabel} a signé — à votre tour (${params.bienTitre})`
  const body = `
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${PALETTE.text};margin:0 0 12px;line-height:1.3;">
      ${signRoleLabel} a signé
    </h1>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      <strong style="color:${PALETTE.text};">${escapeHtml(params.signataireName)}</strong> vient de signer le bail pour
      <strong style="color:${PALETTE.text};">${titreLabel}</strong>.
    </p>
    <p style="margin:0 0 14px;color:${PALETTE.textMuted};line-height:1.65;">
      C'est à votre tour. Une fois votre signature posée, le bail est définitivement actif et vous recevrez tous les deux le PDF complet par email.
    </p>
    ${button(params.ctaUrl, signRoleAction)}
    <p style="margin:18px 0 0;font-size:12px;color:${PALETTE.textSubtle};line-height:1.5;">
      Signature électronique conforme eIDAS Niveau 1.
    </p>
  `
  const html = wrap(`${signRoleLabel} a signé. À votre tour.`, body, "bailsignepart")
  const text = `${signRoleLabel} (${params.signataireName}) a signé le bail pour ${params.bienTitre}${params.ville ? ` à ${params.ville}` : ""}.

C'est à votre tour de signer.

Lien : ${params.ctaUrl}

— L'équipe KeyMatch`
  return { subject, html, text }
}
