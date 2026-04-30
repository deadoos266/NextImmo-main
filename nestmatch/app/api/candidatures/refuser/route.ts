/**
 * POST /api/candidatures/refuser
 *
 * Le proprio refuse explicitement la candidature d'un locataire.
 * Effets symétriques à valider/route.ts :
 *  1. UPDATE messages SET statut_candidature='refusee' sur le 1er message
 *     type='candidature' de cette conversation.
 *  2. INSERT message système [CANDIDATURE_RETIREE] dans la conv (réutilisé,
 *     pas de nouveau prefix — sémantiquement proche pour le locataire).
 *  3. Le bouton "Proposer une visite" reste verrouillé côté locataire avec
 *     popup adapté ("Votre candidature a été refusée").
 *
 * Sécurité : NextAuth + match annonce.proprietaire_email.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../lib/auth"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { PREFIXES } from "../../../../lib/messagePrefixes"
import { sendEmail } from "../../../../lib/email/resend"
import { candidatureRefuseeTemplate } from "../../../../lib/email/templates"
import { displayName } from "../../../../lib/privacy"
import { shouldSendEmailForEvent } from "../../../../lib/notifPreferences"

export const runtime = "nodejs"

interface Body {
  annonceId?: number | string
  locataireEmail?: string
  motif?: string
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
  const motif = (body.motif || "").trim().slice(0, 500)

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

  if (candidatureMsg.statut_candidature === "refusee") {
    return NextResponse.json({ ok: true, alreadyRefused: true })
  }

  const nowIso = new Date().toISOString()

  const { error: updErr } = await supabaseAdmin
    .from("messages")
    .update({ statut_candidature: "refusee" })
    .eq("id", candidatureMsg.id)
  if (updErr) {
    console.error("[refuser] update statut failed", updErr)
    return NextResponse.json({ ok: false, error: "Echec mise à jour" }, { status: 500 })
  }

  // Insert message système [CANDIDATURE_RETIREE] avec motif optionnel
  const payload = JSON.stringify({
    bienTitre: annonce.titre || null,
    refusedAt: nowIso,
    motif: motif || null,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: proprietaireEmail,
    to_email: locataireEmail,
    contenu: `${PREFIXES.CANDIDATURE_RETIREE}${payload}`,
    lu: false,
    annonce_id: annonce.id,
    created_at: nowIso,
  }])

  // Notif cloche locataire (Paul 2026-04-26)
  await supabaseAdmin.from("notifications").insert([{
    user_email: locataireEmail,
    type: "candidature_retiree",
    title: "Candidature non retenue",
    body: annonce.titre
      ? `Le propriétaire de « ${annonce.titre} » a choisi un autre dossier.`
      : "Le propriétaire a choisi un autre dossier.",
    href: "/annonces",
    related_id: String(annonce.id),
    created_at: nowIso,
  }])

  // V53.7 — email locataire avec recommandations (5 annonces similaires)
  try {
    // V54.2 — respect notif_preferences (candidature_refusee)
    const allowed = await shouldSendEmailForEvent(locataireEmail, "candidature_refusee")
    if (!allowed) {
      return NextResponse.json({ ok: true, refusedAt: nowIso, emailSkipped: "pref_off" })
    }
    const ann2 = annonce as { id: number; titre: string | null; ville?: string | null; prix?: number | null; surface?: number | null; pieces?: number | null }
    // Cherche 5 annonces similaires (ville + bracket prix ±20%)
    const prixMin = ann2.prix ? Math.round(ann2.prix * 0.8) : null
    const prixMax = ann2.prix ? Math.round(ann2.prix * 1.2) : null
    let recosQuery = supabaseAdmin
      .from("annonces")
      .select("id, titre, ville, prix")
      .eq("statut", "disponible")
      .neq("id", ann2.id)
      .limit(5)
    if (ann2.ville) recosQuery = recosQuery.eq("ville", ann2.ville)
    if (prixMin !== null) recosQuery = recosQuery.gte("prix", prixMin)
    if (prixMax !== null) recosQuery = recosQuery.lte("prix", prixMax)
    const { data: recosData } = await recosQuery
    const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
    const recommandations = (recosData || []).map(r => ({
      id: r.id,
      titre: r.titre || "Logement",
      ville: r.ville || null,
      prix: typeof r.prix === "number" ? r.prix : null,
      href: `${base}/annonces/${r.id}`,
    }))
    const { data: prof } = await supabaseAdmin
      .from("profils")
      .select("nom, prenom")
      .eq("email", proprietaireEmail)
      .maybeSingle()
    const proprioName = [prof?.prenom, prof?.nom].filter(Boolean).join(" ").trim()
      || displayName(proprietaireEmail, session?.user?.name || null)
      || "Le propriétaire"
    const tpl = candidatureRefuseeTemplate({
      proprioName,
      bienTitre: annonce.titre || "Logement",
      ville: ann2.ville ?? null,
      raison: motif || null,
      recommandations,
      searchUrl: `${base}/annonces`,
    })
    await sendEmail({
      to: locataireEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: "category", value: "candidature_refusee" }],
      senderEmail: proprietaireEmail,
    })
  } catch (e) {
    console.warn("[refuser] email candidature_refusee failed:", e)
  }

  return NextResponse.json({ ok: true, refusedAt: nowIso })
}
