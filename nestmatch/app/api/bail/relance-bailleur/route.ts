/**
 * V33.4 — Relance signature/envoi bail PAR le locataire AU bailleur.
 * Audit produit V31 R2.1 : avant cette feature, le locataire qui a accepté
 * l'invitation puis attendu 5 jours sans nouvelles n'avait aucun moyen
 * de relancer côté plateforme — il devait basculer sur WhatsApp / email
 * direct, sortant du tunnel KeyMatch.
 *
 * 2 cas couverts :
 * 1. bail_genere_at NULL : locataire a accepté l'invitation, proprio
 *    n'a pas encore généré le PDF. → "Le locataire vous demande d'envoyer
 *    le bail."
 * 2. bail_signe_locataire_at NOT NULL + bail_signe_bailleur_at NULL :
 *    locataire a signé, attend la contresignature. → "Le locataire vous
 *    demande de contresigner le bail."
 *
 * Auth : NextAuth + match locataire_email.
 * Rate-limit : 24h via annonces.bail_relance_locataire_at.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"

const MIN_RELANCE_INTERVAL_MS = 24 * 60 * 60 * 1000

function buildEmail(params: {
  locataireName: string
  bienTitre: string
  ville: string | null
  contexte: "envoi" | "contresignature"
  jours: number
  baseUrl: string
  annonceId: number
}): { subject: string; html: string; text: string } {
  const ctxLabel = params.ville ? `${params.bienTitre} à ${params.ville}` : params.bienTitre
  const cta = params.contexte === "envoi"
    ? `${params.baseUrl}/proprietaire/bail/${params.annonceId}`
    : `${params.baseUrl}/messages?with=${encodeURIComponent("")}&annonce=${params.annonceId}`
  const intro = params.contexte === "envoi"
    ? `${params.locataireName} a accepté votre invitation pour <strong>${ctxLabel}</strong> il y a ${params.jours} jour${params.jours > 1 ? "s" : ""} et attend que vous lui envoyiez le bail.`
    : `${params.locataireName} a signé le bail pour <strong>${ctxLabel}</strong> il y a ${params.jours} jour${params.jours > 1 ? "s" : ""} et attend votre contresignature.`
  const subject = params.contexte === "envoi"
    ? `Rappel : ${params.locataireName} attend le bail — ${params.bienTitre}`
    : `Rappel : ${params.locataireName} attend votre contresignature — ${params.bienTitre}`

  const html = `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F7F4EF;color:#111;">
  <h1 style="font-size:22px;font-weight:800;margin:0 0 12px;">Votre locataire vous attend</h1>
  <p style="margin:0 0 14px;line-height:1.6;color:#4b5563;">${intro}</p>
  <a href="${cta}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;">${params.contexte === "envoi" ? "Générer et envoyer le bail →" : "Voir le bail à signer →"}</a>
  <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
    Vous recevez ce rappel parce que votre locataire l'a déclenché manuellement depuis son espace KeyMatch.
  </p>
</div>`
  const text = `Rappel locataire : ${intro.replace(/<[^>]+>/g, "")}\n\nLien : ${cta}\n\n— L'équipe KeyMatch`
  return { subject, html, text }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 }) }

  const annonceId = Number((body as { annonceId?: unknown }).annonceId)
  if (!annonceId || !Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }

  const { data: annonce, error: errAnn } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, bail_genere_at, bail_signe_locataire_at, bail_signe_bailleur_at, bail_relance_locataire_at, date_debut_bail")
    .eq("id", annonceId)
    .single()
  if (errAnn || !annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  const locEmail = (annonce.locataire_email || "").toLowerCase()
  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  if (locEmail !== userEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }
  if (!propEmail) {
    return NextResponse.json({ ok: false, error: "Pas de propriétaire associé" }, { status: 400 })
  }

  // Détecte le contexte
  let contexte: "envoi" | "contresignature"
  if (!annonce.bail_genere_at) {
    contexte = "envoi"
  } else if (annonce.bail_signe_locataire_at && !annonce.bail_signe_bailleur_at) {
    contexte = "contresignature"
  } else if (annonce.bail_signe_bailleur_at) {
    return NextResponse.json({ ok: true, skipped: "already_double_signed" })
  } else {
    // bail envoyé pas encore signé par le locataire — pas de raison de relancer le bailleur
    return NextResponse.json({ ok: false, error: "Le bail vous attend pour signature" }, { status: 400 })
  }

  const lastRelance = annonce.bail_relance_locataire_at ? new Date(annonce.bail_relance_locataire_at).getTime() : 0
  const now = Date.now()
  if (lastRelance && now - lastRelance < MIN_RELANCE_INTERVAL_MS) {
    return NextResponse.json({ ok: false, error: "Une relance a déjà été envoyée récemment", skipped: "throttled" }, { status: 429 })
  }

  // Calcule "jours d'attente" : depuis acceptation (bail_source change) ou
  // signature locataire selon le contexte. À défaut, 1 jour.
  const baseAt = contexte === "envoi"
    ? new Date(annonce.date_debut_bail || annonce.bail_genere_at || new Date()).getTime()
    : new Date(annonce.bail_signe_locataire_at!).getTime()
  const jours = Math.max(1, Math.floor((now - baseAt) / (24 * 60 * 60 * 1000)))

  // Récupère le nom du locataire depuis profils
  const { data: locProfil } = await supabaseAdmin
    .from("profils")
    .select("prenom, nom")
    .eq("email", locEmail)
    .maybeSingle()
  const locataireName = [locProfil?.prenom, locProfil?.nom].filter(Boolean).join(" ").trim() || locEmail

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://keymatch-immo.fr"
  const tpl = buildEmail({
    locataireName,
    bienTitre: annonce.titre || "Logement",
    ville: annonce.ville || null,
    contexte,
    jours,
    baseUrl,
    annonceId,
  })

  const sendRes = await sendEmail({
    to: propEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: "type", value: "bail_relance_locataire" },
      { name: "contexte", value: contexte },
    ],
  })

  const nowIso = new Date().toISOString()
  await supabaseAdmin.from("annonces").update({ bail_relance_locataire_at: nowIso }).eq("id", annonceId)

  // Message in-app (depuis locataire vers proprio)
  await supabaseAdmin.from("messages").insert([
    {
      from_email: locEmail,
      to_email: propEmail,
      contenu: `[BAIL_RELANCE_LOCATAIRE]Rappel : ${contexte === "envoi" ? "j'attends que vous m'envoyiez le bail" : "j'attends votre contresignature"} (${jours} jour${jours > 1 ? "s" : ""}).`,
      lu: false,
      annonce_id: annonceId,
      created_at: nowIso,
    },
  ])
  await supabaseAdmin.from("notifications").insert([
    {
      user_email: propEmail,
      type: "bail_relance_locataire",
      title: contexte === "envoi" ? "Le locataire attend le bail" : "Le locataire attend votre contresignature",
      body: `${locataireName} vous demande d'avancer (${jours} jour${jours > 1 ? "s" : ""} d'attente).`,
      href: contexte === "envoi" ? `/proprietaire/bail/${annonceId}` : `/messages?annonce=${annonceId}`,
      related_id: String(annonceId),
      lu: false,
      created_at: nowIso,
    },
  ])

  return NextResponse.json({
    ok: true,
    sent: sendRes.ok,
    skipped: sendRes.ok === false && sendRes.skipped ? "no_resend_key" : undefined,
    contexte,
    jours,
  })
}
