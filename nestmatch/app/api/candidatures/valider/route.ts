/**
 * POST /api/candidatures/valider
 *
 * Le proprio valide explicitement la candidature d'un locataire pour
 * une de ses annonces. Effets :
 *  1. UPDATE messages SET statut_candidature='validee' sur le 1er message
 *     type='candidature' de cette conversation.
 *  2. INSERT message système [CANDIDATURE_VALIDEE] dans la conversation.
 *  3. Notif cloche locataire "Vous pouvez proposer une visite".
 *
 * Ce statut débloque côté locataire le droit de proposer une visite
 * (cf BookingVisite.tsx + ProposerVisiteDialog gating sur candidatureStatut).
 *
 * Sécurité : NextAuth + le caller doit être proprietaire_email de l'annonce
 * (vérifié via service_role lookup + match annonce.proprietaire_email).
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../lib/auth"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { PREFIXES } from "../../../../lib/messagePrefixes"
import { sendEmail } from "../../../../lib/email/resend"
import { candidatureValideeTemplate } from "../../../../lib/email/templates"
import { displayName } from "../../../../lib/privacy"
import { shouldSendEmailForEvent } from "../../../../lib/notifPreferencesServer"

export const runtime = "nodejs"

interface Body {
  annonceId?: number | string
  locataireEmail?: string
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 })
  }
  if (!body.annonceId || !body.locataireEmail) {
    return NextResponse.json({ ok: false, error: "annonceId + locataireEmail requis" }, { status: 400 })
  }

  const locataireEmail = body.locataireEmail.toLowerCase()

  // Récupère l'annonce pour vérifier que c'est bien le proprio qui valide
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, proprietaire_email")
    .eq("id", body.annonceId)
    .maybeSingle()

  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin === true
  const proprietaireEmail = (annonce.proprietaire_email || "").toLowerCase()
  if (proprietaireEmail !== userEmail && !isAdmin) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  // Trouve le 1er message candidature (le plus ancien type='candidature' du
  // locataire vers le proprio) — c'est lui qui porte le statut.
  const { data: candidatureMsg } = await supabaseAdmin
    .from("messages")
    .select("id, statut_candidature")
    .eq("annonce_id", annonce.id)
    .eq("from_email", locataireEmail)
    .eq("to_email", proprietaireEmail)
    .eq("type", "candidature")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!candidatureMsg) {
    return NextResponse.json({ ok: false, error: "Candidature introuvable" }, { status: 404 })
  }

  // Idempotence : si déjà validée, on renvoie OK silencieusement
  if (candidatureMsg.statut_candidature === "validee") {
    return NextResponse.json({ ok: true, alreadyValidated: true })
  }

  const nowIso = new Date().toISOString()

  // 1. Marque le statut sur le message candidature
  const { error: updErr } = await supabaseAdmin
    .from("messages")
    .update({ statut_candidature: "validee" })
    .eq("id", candidatureMsg.id)
  if (updErr) {
    console.error("[valider] update statut failed", updErr)
    return NextResponse.json({ ok: false, error: "Echec mise à jour" }, { status: 500 })
  }

  // 2. Insert message système dans la conv pour rendre la décision visible
  const payload = JSON.stringify({
    bienTitre: annonce.titre || null,
    validatedAt: nowIso,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: proprietaireEmail,
    to_email: locataireEmail,
    contenu: `${PREFIXES.CANDIDATURE_VALIDEE}${payload}`,
    lu: false,
    annonce_id: annonce.id,
    created_at: nowIso,
  }])

  // 3. Notif cloche locataire — débloque la proposition de visite (Paul 2026-04-26)
  await supabaseAdmin.from("notifications").insert([{
    user_email: locataireEmail,
    type: "candidature_validee",
    title: "Votre candidature a été validée",
    body: annonce.titre
      ? `Le propriétaire de « ${annonce.titre} » vous invite à proposer une visite.`
      : "Le propriétaire vous invite à proposer une visite.",
    href: `/messages?with=${encodeURIComponent(proprietaireEmail)}&annonce=${annonce.id}`,
    related_id: String(annonce.id),
    created_at: nowIso,
  }])

  // 4. V53.4 — email locataire "candidature validée"
  try {
    // V54.2 — respect notif_preferences (candidature_validee)
    const allowed = await shouldSendEmailForEvent(locataireEmail, "candidature_validee")
    if (!allowed) {
      return NextResponse.json({ ok: true, validatedAt: nowIso, emailSkipped: "pref_off" })
    }
    const { data: prof } = await supabaseAdmin
      .from("profils")
      .select("nom, prenom")
      .eq("email", proprietaireEmail)
      .maybeSingle()
    const proprioName = [prof?.prenom, prof?.nom].filter(Boolean).join(" ").trim()
      || displayName(proprietaireEmail, session?.user?.name || null)
      || "Le propriétaire"
    const ann2 = annonce as { ville?: string | null }
    const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
    const tpl = candidatureValideeTemplate({
      proprioName,
      bienTitre: annonce.titre || "Logement",
      ville: ann2.ville ?? null,
      convUrl: `${base}/messages?with=${encodeURIComponent(proprietaireEmail)}&annonce=${annonce.id}`,
    })
    await sendEmail({
      to: locataireEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: "category", value: "candidature_validee" }],
      senderEmail: proprietaireEmail,
    })
  } catch (e) {
    console.warn("[valider] email candidature_validee failed:", e)
  }

  return NextResponse.json({ ok: true, validatedAt: nowIso })
}
