/**
 * V87.5 — POST /api/admin/emails/test
 *
 * Envoie un email test à l'admin connecté (ou à un destinataire override).
 * Permet de valider que le provider actif marche, le from est correct, etc.
 *
 * V97.39.19 — passe par le dispatcher `@/lib/email` donc teste le provider
 * actuellement configuré (Resend par défaut, Brevo si EMAIL_PROVIDER=brevo).
 * C'est le comportement voulu : on veut savoir si la prod peut envoyer, pas
 * forcer Resend si Paul est en train de migrer vers Brevo.
 *
 * Auth admin strict.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin || !session.user.email) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const to = typeof body.to === "string" && body.to.includes("@") ? body.to : session.user.email

  const ts = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })
  const subject = `[KeyMatch Admin] Test email · ${ts}`
  const html = `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 30px; background: #F7F4EF; color: #111;">
  <h1 style="font-family: Georgia, serif; font-style: italic; font-size: 28px; margin: 0 0 12px;">KeyMatch — Test email</h1>
  <p style="font-size: 15px; line-height: 1.6;">
    Cet email est un test envoyé depuis <strong>/admin/emails</strong> à <code>${ts}</code>.
  </p>
  <p style="font-size: 15px; line-height: 1.6;">
    Si tu reçois ce message, c'est que Resend fonctionne correctement, ta config SPF/DKIM/DMARC est bonne,
    et le from address est valide.
  </p>
  <div style="margin-top: 30px; padding: 16px; background: white; border: 1px solid #EAE6DF; border-radius: 12px;">
    <p style="margin: 0; font-size: 12px; color: #6b6358; text-transform: uppercase; letter-spacing: 1.4px;">Détails</p>
    <ul style="margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: #111;">
      <li>Envoyé par : ${session.user.email}</li>
      <li>Destinataire : ${to}</li>
      <li>Timestamp : ${ts}</li>
      <li>Origin : POST /api/admin/emails/test</li>
    </ul>
  </div>
  <p style="margin-top: 20px; font-size: 11px; color: #6b6358;">
    KeyMatch — Cet email a été déclenché manuellement depuis le dashboard admin.
  </p>
</body></html>`.trim()

  const result = await sendEmail({
    to,
    subject,
    html,
    text: `Test email KeyMatch envoyé à ${ts}. Si tu reçois ce message, Resend fonctionne.`,
    templateName: "admin_test",
    tags: [{ name: "type", value: "admin_test" }],
  })

  if (result.ok === true) {
    return NextResponse.json({ ok: true, to, id: result.id })
  } else {
    return NextResponse.json({
      ok: false,
      to,
      error: result.error,
      skipped: result.skipped,
    })
  }
}
