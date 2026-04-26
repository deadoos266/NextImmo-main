/**
 * POST /api/candidatures/devalider
 *
 * Le proprio annule la validation d'une candidature qu'il avait validée.
 * Cas d'usage : il découvre quelque chose sur le candidat après validation,
 * ou il a validé par erreur. Effets :
 *  1. UPDATE messages SET statut_candidature=NULL sur le 1er message
 *     type='candidature' de cette conversation.
 *  2. INSERT message système [CANDIDATURE_DEVALIDEE] dans la conversation
 *     pour que le candidat voie l'événement.
 *  3. Notif cloche locataire "Le propriétaire a retiré la validation".
 *
 * Effet de bord : le locataire ne peut plus proposer de visite (gating
 * sur statut_candidature='validee' côté BookingVisite).
 *
 * Sécurité : NextAuth + le caller doit être proprietaire_email de l'annonce.
 *
 * Refus de dévalider :
 *  - Si l'annonce a déjà statut="loué" avec ce candidat → 409 Conflict
 *    (impossible de dévalider un candidat qui a déjà signé le bail).
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

  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, proprietaire_email, statut, locataire_email")
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

  // Garde-fou : impossible de dévalider un candidat qui a déjà signé le bail.
  // Le bail acte une décision juridique, on ne revient pas en arrière côté flow
  // candidature (passer par "Résiliation du bail" qui est un autre process).
  if (annonce.statut === "loué"
      && (annonce.locataire_email || "").toLowerCase() === locataireEmail) {
    return NextResponse.json(
      { ok: false, error: "Bail déjà signé avec ce candidat — impossible de dévalider la candidature." },
      { status: 409 },
    )
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

  // Idempotence : si pas validée, on renvoie OK silencieusement
  if (candidatureMsg.statut_candidature !== "validee") {
    return NextResponse.json({ ok: true, alreadyNotValidated: true })
  }

  const nowIso = new Date().toISOString()

  // 1. Reset le statut sur le message candidature
  const { error: updErr } = await supabaseAdmin
    .from("messages")
    .update({ statut_candidature: null })
    .eq("id", candidatureMsg.id)
  if (updErr) {
    console.error("[devalider] update statut failed", updErr)
    return NextResponse.json({ ok: false, error: "Echec mise à jour" }, { status: 500 })
  }

  // 2. Insert message système — visibilité du retour en arrière côté locataire
  const payload = JSON.stringify({
    bienTitre: annonce.titre || null,
    devalidatedAt: nowIso,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: proprietaireEmail,
    to_email: locataireEmail,
    contenu: `${PREFIXES.CANDIDATURE_DEVALIDEE}${payload}`,
    lu: false,
    annonce_id: annonce.id,
    created_at: nowIso,
  }])

  // 3. Notif cloche locataire
  await supabaseAdmin.from("notifications").insert([{
    user_email: locataireEmail,
    type: "candidature_devalidee",
    title: "Validation retirée",
    body: annonce.titre
      ? `Le propriétaire de « ${annonce.titre} » a retiré la validation de votre candidature.`
      : "Le propriétaire a retiré la validation de votre candidature.",
    href: `/messages?with=${encodeURIComponent(proprietaireEmail)}&annonce=${annonce.id}`,
    related_id: String(annonce.id),
    created_at: nowIso,
  }])

  return NextResponse.json({ ok: true, devalidatedAt: nowIso })
}
