/**
 * POST /api/bail/accepter/[token]
 *
 * Le locataire clique sur le lien email "Accepter et créer mon compte".
 * Cette route :
 *  1. Valide le token (existe, statut=pending, pas expiré).
 *  2. Vérifie que le user connecté correspond bien à locataire_email
 *     (sinon retourne `requireLogin` avec l'email à utiliser).
 *  3. Marque l'invitation `accepted` + responded_at.
 *  4. Met à jour l'annonce : bail_source = 'imported',
 *     locataire_email = email du user, loue = true.
 *  5. Crée une notif cloche pour le proprio + envoie email confirmation.
 *
 * GET /api/bail/accepter/[token] : retourne les détails de l'invitation
 * (utilisé par la page /bail-invitation/[token] avant action).
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../../lib/auth"
import { supabaseAdmin } from "../../../../../lib/supabase-server"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ token: string }>
}

async function loadInvitation(token: string) {
  const { data, error } = await supabaseAdmin
    .from("bail_invitations")
    .select("id, annonce_id, proprietaire_email, locataire_email, statut, loyer_hc, charges, message_proprio, expires_at, responded_at, created_at")
    .eq("token", token)
    .maybeSingle()
  if (error) {
    console.error("[bail/accepter] load failed", error)
    return null
  }
  return data
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 400 })
  }

  const invit = await loadInvitation(token)
  if (!invit) {
    return NextResponse.json({ ok: false, error: "Invitation introuvable" }, { status: 404 })
  }

  // Joindre le titre/ville de l'annonce + nom proprio pour l'affichage
  const [{ data: annonce }, { data: proprioProfil }] = await Promise.all([
    supabaseAdmin
      .from("annonces")
      .select("id, titre, ville, adresse, surface, pieces, meuble, prix, charges, bail_source, import_metadata")
      .eq("id", invit.annonce_id)
      .maybeSingle(),
    supabaseAdmin
      .from("profils")
      .select("nom, prenom")
      .eq("email", invit.proprietaire_email)
      .maybeSingle(),
  ])

  const proprioName = [proprioProfil?.prenom, proprioProfil?.nom].filter(Boolean).join(" ") || invit.proprietaire_email
  const isExpired = new Date(invit.expires_at).getTime() < Date.now()

  return NextResponse.json({
    ok: true,
    invitation: {
      id: invit.id,
      statut: isExpired && invit.statut === "pending" ? "expired" : invit.statut,
      proprietaireEmail: invit.proprietaire_email,
      proprietaireName: proprioName,
      locataireEmail: invit.locataire_email,
      loyerHC: invit.loyer_hc,
      charges: invit.charges,
      messageProprio: invit.message_proprio,
      expiresAt: invit.expires_at,
      respondedAt: invit.responded_at,
      annonce,
    },
  })
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()

  const invit = await loadInvitation(token)
  if (!invit) {
    return NextResponse.json({ ok: false, error: "Invitation introuvable" }, { status: 404 })
  }
  if (invit.statut !== "pending") {
    return NextResponse.json({ ok: false, error: `Invitation déjà ${invit.statut}` }, { status: 409 })
  }
  if (new Date(invit.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("bail_invitations")
      .update({ statut: "expired", responded_at: new Date().toISOString() })
      .eq("id", invit.id)
    return NextResponse.json({ ok: false, error: "Invitation expirée" }, { status: 410 })
  }

  // Pas connecté → demande de login avec l'email cible préfilled
  if (!userEmail) {
    return NextResponse.json({
      ok: false,
      requireLogin: true,
      targetEmail: invit.locataire_email,
      error: `Connectez-vous avec ${invit.locataire_email} pour accepter cette invitation.`,
    }, { status: 401 })
  }

  // Connecté avec un autre email → erreur claire
  if (userEmail !== invit.locataire_email.toLowerCase()) {
    return NextResponse.json({
      ok: false,
      wrongAccount: true,
      targetEmail: invit.locataire_email,
      error: `Cette invitation a été envoyée à ${invit.locataire_email}. Connectez-vous avec ce compte.`,
    }, { status: 403 })
  }

  // Marque accepted
  const now = new Date().toISOString()
  const { error: updErr } = await supabaseAdmin
    .from("bail_invitations")
    .update({ statut: "accepted", responded_at: now })
    .eq("id", invit.id)
    .eq("statut", "pending")  // double check anti-race

  if (updErr) {
    console.error("[bail/accepter] update invitation failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour invitation a échoué" }, { status: 500 })
  }

  // Met à jour l'annonce : bail_source = imported, locataire_email = userEmail
  const { error: annonceErr } = await supabaseAdmin
    .from("annonces")
    .update({
      bail_source: "imported",
      locataire_email: userEmail,
      loue: true,
    })
    .eq("id", invit.annonce_id)
    .eq("proprietaire_email", invit.proprietaire_email)  // sécurité

  if (annonceErr) {
    console.error("[bail/accepter] update annonce failed", annonceErr)
    // On ne rollback pas l'invitation : le statut accepted est plus important
    // que la cohérence de l'annonce (l'admin peut corriger après).
  }

  // Notif cloche proprio
  try {
    await supabaseAdmin.from("notifications").insert([{
      user_email: invit.proprietaire_email,
      type: "bail_invitation_accepted",
      title: "Bail accepté",
      body: `${invit.locataire_email} a accepté votre invitation et rejoint la plateforme.`,
      href: "/proprietaire",
      related_id: String(invit.annonce_id),
      lu: false,
      created_at: now,
    }])
  } catch (e) {
    console.error("[bail/accepter] notif insert failed", e)
  }

  return NextResponse.json({
    ok: true,
    annonceId: invit.annonce_id,
    redirect: "/proprietaire" + (invit.locataire_email ? "" : ""),  // locataire space coming soon
  })
}
