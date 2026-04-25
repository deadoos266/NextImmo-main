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

  return NextResponse.json({ ok: true, refusedAt: nowIso })
}
