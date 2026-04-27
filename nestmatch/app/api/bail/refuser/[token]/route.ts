/**
 * POST /api/bail/refuser/[token]
 *
 * Le locataire clique sur "Ce n'est pas mon bail / refuser".
 *  1. Valide le token + statut pending + pas expiré.
 *  2. Marque l'invitation `declined` + responded_at.
 *  3. Archive l'annonce (loue = false, désactive — l'admin pourra purger).
 *  4. Notif + email proprio l'informant du refus.
 *
 * Ne nécessite PAS d'être loggué : le token suffit (le locataire peut ne
 * pas avoir de compte et veut juste dire "ce n'est pas moi").
 */

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../../lib/supabase-server"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ token: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 400 })
  }

  const { data: invit, error: loadErr } = await supabaseAdmin
    .from("bail_invitations")
    .select("id, annonce_id, proprietaire_email, locataire_email, statut, expires_at")
    .eq("token", token)
    .maybeSingle()

  if (loadErr || !invit) {
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

  const now = new Date().toISOString()
  const { error: updErr } = await supabaseAdmin
    .from("bail_invitations")
    .update({ statut: "declined", responded_at: now })
    .eq("id", invit.id)
    .eq("statut", "pending")

  if (updErr) {
    console.error("[bail/refuser] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour a échoué" }, { status: 500 })
  }

  // Archive l'annonce orpheline : on remet loue = false et on retire le
  // locataire_email s'il avait été pré-rempli (pour permettre une nouvelle
  // invitation à un autre locataire si le proprio s'est trompé d'email).
  await supabaseAdmin
    .from("annonces")
    .update({
      loue: false,
      locataire_email: null,
    })
    .eq("id", invit.annonce_id)
    .eq("proprietaire_email", invit.proprietaire_email)

  // Notif cloche proprio
  try {
    await supabaseAdmin.from("notifications").insert([{
      user_email: invit.proprietaire_email,
      type: "bail_invitation_declined",
      title: "Invitation refusée",
      body: `${invit.locataire_email} a refusé votre invitation. Vous pouvez modifier l'email et renvoyer.`,
      href: "/proprietaire",
      related_id: String(invit.annonce_id),
      lu: false,
      created_at: now,
    }])
  } catch (e) {
    console.error("[bail/refuser] notif insert failed", e)
  }

  return NextResponse.json({ ok: true })
}
