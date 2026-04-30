/**
 * POST /api/notifications/event — Dispatcher centralisé pour les emails P0
 * shippés en V52 (visite, dossier, bail signature partial).
 *
 * Pourquoi un dispatcher unique vs une route par event ?
 * - Le client appelle déjà fire-and-forget après un insert/update Supabase
 *   client-side. Un seul endpoint = moins de surface API à sécuriser.
 * - Auth NextAuth obligatoire — le `from_email` est forcé à session.email
 *   anti-spoof. Pas de header trustable.
 * - Rate-limit par from_email + ip (anti-flood).
 *
 * Body : { type: "...", to: string, ... }
 *
 * V50.1 — sendEmail() a un guard self-email natif. On passe `senderEmail`
 * en plus du from session pour défense en profondeur.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { sendEmail } from "@/lib/email/resend"
import { displayName } from "@/lib/privacy"
import {
  visiteProposeeTemplate,
  visiteConfirmeeTemplate,
  visiteAnnuleeTemplate,
  dossierDemandeTemplate,
  dossierPartageTemplate,
  bailSignePartialTemplate,
} from "@/lib/email/templates"

type EventBody =
  | { type: "visite_proposee"; to: string; bienTitre: string; ville?: string | null; slots: Array<{ date: string; heure: string }>; format: "physique" | "visio"; message?: string | null; convUrl?: string; isCounter?: boolean }
  | { type: "visite_confirmee"; to: string; bienTitre: string; ville?: string | null; date: string; heure: string; format: "physique" | "visio"; destinataireRole: "locataire" | "proprietaire"; convUrl?: string; adresse?: string | null }
  | { type: "visite_annulee"; to: string; bienTitre: string; ville?: string | null; date: string; heure: string; raison?: string | null; convUrl?: string }
  | { type: "dossier_demande"; to: string; bienTitre: string; ville?: string | null; convUrl?: string }
  | { type: "dossier_partage"; to: string; bienTitre: string; ville?: string | null; score?: number | null; shareUrl?: string | null; convUrl?: string }
  | { type: "bail_signe_partial"; to: string; bienTitre: string; ville?: string | null; signataireRole: "locataire" | "bailleur"; destinataireRole: "locataire" | "bailleur"; ctaUrl?: string }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const fromEmail = session?.user?.email?.toLowerCase()
  if (!fromEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const p = body as EventBody
  const to = typeof p?.to === "string" ? p.to.trim().toLowerCase() : ""
  if (!to || !p?.type) {
    return NextResponse.json({ ok: false, error: "to et type requis" }, { status: 400 })
  }

  // Rate-limit anti-flood : 30 events / heure / from+ip
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`notif-event:${fromEmail}:${ip}`, { max: 30, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Trop d'envois" }, { status: 429 })
  }

  // Respect des préférences email du destinataire (pour les events qui sont
  // logiquement assimilables à des messages). Les events critiques (bail
  // signe partial) ignorent la pref pour ne pas bloquer un signal légal.
  const ignorePref = p.type === "bail_signe_partial"
  if (!ignorePref) {
    const { data: prof } = await supabaseAdmin
      .from("profils")
      .select("notif_messages_email")
      .eq("email", to)
      .maybeSingle()
    if (prof && prof.notif_messages_email === false) {
      return NextResponse.json({ ok: true, skipped: "pref_off" })
    }
  }

  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  const fromName = displayName(fromEmail, session?.user?.name || null) || "Un utilisateur"
  const convUrl = (p as { convUrl?: string }).convUrl && (p as { convUrl?: string }).convUrl!.startsWith("/")
    ? `${base}${(p as { convUrl?: string }).convUrl}`
    : `${base}/messages`

  let subject = ""
  let html = ""
  let text = ""
  let tag = ""

  switch (p.type) {
    case "visite_proposee": {
      const t = visiteProposeeTemplate({
        fromName,
        bienTitre: p.bienTitre,
        ville: p.ville ?? null,
        slots: p.slots || [],
        format: p.format,
        message: p.message,
        convUrl,
        isCounter: p.isCounter,
      })
      subject = t.subject; html = t.html; text = t.text; tag = "visite_proposee"
      break
    }
    case "visite_confirmee": {
      const t = visiteConfirmeeTemplate({
        bienTitre: p.bienTitre,
        ville: p.ville ?? null,
        date: p.date,
        heure: p.heure,
        format: p.format,
        destinataireRole: p.destinataireRole,
        convUrl,
        adresse: p.adresse,
      })
      subject = t.subject; html = t.html; text = t.text; tag = "visite_confirmee"
      break
    }
    case "visite_annulee": {
      const t = visiteAnnuleeTemplate({
        fromName,
        bienTitre: p.bienTitre,
        ville: p.ville ?? null,
        date: p.date,
        heure: p.heure,
        raison: p.raison,
        convUrl,
      })
      subject = t.subject; html = t.html; text = t.text; tag = "visite_annulee"
      break
    }
    case "dossier_demande": {
      const t = dossierDemandeTemplate({
        fromName,
        bienTitre: p.bienTitre,
        ville: p.ville ?? null,
        convUrl,
      })
      subject = t.subject; html = t.html; text = t.text; tag = "dossier_demande"
      break
    }
    case "dossier_partage": {
      const t = dossierPartageTemplate({
        fromName,
        bienTitre: p.bienTitre,
        ville: p.ville ?? null,
        score: p.score ?? null,
        shareUrl: p.shareUrl ?? null,
        convUrl,
      })
      subject = t.subject; html = t.html; text = t.text; tag = "dossier_partage"
      break
    }
    case "bail_signe_partial": {
      const ctaUrl = (p.ctaUrl && p.ctaUrl.startsWith("/")) ? `${base}${p.ctaUrl}` : convUrl
      const t = bailSignePartialTemplate({
        signataireRole: p.signataireRole,
        signataireName: fromName,
        bienTitre: p.bienTitre,
        ville: p.ville ?? null,
        destinataireRole: p.destinataireRole,
        ctaUrl,
      })
      subject = t.subject; html = t.html; text = t.text; tag = "bail_signe_partial"
      break
    }
    default: {
      return NextResponse.json({ ok: false, error: "Type d'event inconnu" }, { status: 400 })
    }
  }

  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: "category", value: tag }],
    senderEmail: fromEmail,
  })
  return NextResponse.json({ ok: result.ok, skipped: !result.ok })
}
