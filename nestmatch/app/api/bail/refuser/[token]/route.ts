/**
 * POST /api/bail/refuser/[token]
 *
 * Le locataire clique sur "Ce n'est pas mon bail / refuser".
 *  1. Valide le token + statut pending + pas expiré.
 *  2. Marque l'invitation `declined` + responded_at.
 *  3. Archive l'annonce (loue = false, désactive — l'admin pourra purger).
 *  4. Notif + message [BAIL_REFUSE] au proprio l'informant du refus.
 *
 * V33.6 — Body optionnel `{ raison: string, motif?: string }` :
 *   raison ∈ "loyer_eleve" | "surface_insuffisante" | "changement_situation" | "autre"
 *   motif = texte libre optionnel (max 500 chars)
 *
 * Ne nécessite PAS d'être loggué : le token suffit (le locataire peut ne
 * pas avoir de compte et veut juste dire "ce n'est pas moi").
 */

import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../../lib/supabase-server"

export const runtime = "nodejs"

const RAISON_LABELS: Record<string, string> = {
  loyer_eleve: "Loyer trop élevé",
  surface_insuffisante: "Surface insuffisante",
  changement_situation: "Changement de situation",
  autre: "Autre raison",
  pas_mon_bail: "Ce n'est pas mon bail",
}

interface RouteParams {
  params: Promise<{ token: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 400 })
  }

  // V33.6 — body optionnel
  let raison = "autre"
  let motif = ""
  try {
    const body = await req.json().catch(() => ({}))
    const r = (body as { raison?: unknown }).raison
    const m = (body as { motif?: unknown }).motif
    if (typeof r === "string" && Object.prototype.hasOwnProperty.call(RAISON_LABELS, r)) {
      raison = r
    }
    if (typeof m === "string") {
      motif = m.trim().slice(0, 500)
    }
  } catch {
    /* body manquant ou invalide → defaults */
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

  // V33.6 — Message in-app [BAIL_REFUSE] dans le thread (vue proprio).
  // Avant : seule notif cloche, contexte perdu après lecture.
  const raisonLabel = RAISON_LABELS[raison] || RAISON_LABELS.autre
  const refusPayload = JSON.stringify({
    raison,
    raisonLabel,
    motif,
    annonceId: invit.annonce_id,
    declinedAt: now,
    locataireEmail: invit.locataire_email,
  })
  try {
    await supabaseAdmin.from("messages").insert([{
      from_email: invit.locataire_email,
      to_email: invit.proprietaire_email,
      contenu: `[BAIL_REFUSE]${refusPayload}`,
      lu: false,
      annonce_id: invit.annonce_id,
      created_at: now,
    }])
  } catch (e) {
    console.error("[bail/refuser] message insert failed", e)
  }

  // Notif cloche proprio
  try {
    await supabaseAdmin.from("notifications").insert([{
      user_email: invit.proprietaire_email,
      type: "bail_invitation_declined",
      title: "Invitation refusée",
      body: `${invit.locataire_email} a refusé votre invitation${motif ? ` — « ${motif.slice(0, 80)} »` : ""}. Raison : ${raisonLabel.toLowerCase()}.`,
      href: `/proprietaire/bail/importer?relance_refus=${invit.annonce_id}`,
      related_id: String(invit.annonce_id),
      lu: false,
      created_at: now,
    }])
  } catch (e) {
    console.error("[bail/refuser] notif insert failed", e)
  }

  return NextResponse.json({ ok: true, raison, raisonLabel })
}
