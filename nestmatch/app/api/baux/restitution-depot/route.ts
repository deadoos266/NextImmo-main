/**
 * V57.2 — POST /api/baux/restitution-depot
 *
 * Le proprio enregistre la restitution du dépôt de garantie au locataire,
 * potentiellement avec retenues pour dégradations imputables.
 *
 * Délai légal ALUR (loi du 6 juillet 1989, art. 22) :
 *   - 1 mois après remise des clés si pas de retenue
 *   - 2 mois si retenue (avec justificatifs OBLIGATOIRES)
 *   - Au-delà : intérêts de 10% du loyer mensuel par mois de retard
 *
 * Body : {
 *   annonceId: number,
 *   montantRetenu: number      // 0 si restitution intégrale
 *   motifsRetenue?: Array<{ libelle: string; montant: number; type: "degradation" | "loyer_impaye" | "charges" | "autre" }>
 * }
 *
 * Effets :
 *   1. Update annonces.depot_restitue_at + depot_montant_retenu + depot_motifs_retenue
 *   2. Insert message [DEPOT_RESTITUE] dans le thread (locataire <-> proprio)
 *   3. Notif cloche locataire
 *   4. Email locataire (template depotRestitueTemplate à venir)
 *
 * Sécurité : NextAuth + match proprietaire_email.
 *
 * Validation :
 *   - montantRetenu >= 0 et <= caution
 *   - Si montantRetenu > 0, motifsRetenue requis (justificatifs ALUR)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

interface MotifRetenue {
  libelle: string
  montant: number
  type: "degradation" | "loyer_impaye" | "charges" | "autre"
}

interface Body {
  annonceId?: number | string
  montantRetenu?: number
  motifsRetenue?: MotifRetenue[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const annonceId = Number(body.annonceId)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  const montantRetenu = Math.max(0, Number(body.montantRetenu) || 0)
  const motifsRetenue: MotifRetenue[] = Array.isArray(body.motifsRetenue) ? body.motifsRetenue : []

  // Validation motifs si retenue
  if (montantRetenu > 0 && motifsRetenue.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "Une retenue sur dépôt requiert des justificatifs (motifsRetenue). C'est une obligation légale ALUR.",
    }, { status: 400 })
  }
  // Cohérence sum(motifs) ≈ montantRetenu (tolérance 1€ pour arrondis)
  if (motifsRetenue.length > 0) {
    const sumMotifs = motifsRetenue.reduce((acc, m) => acc + Math.max(0, Number(m.montant) || 0), 0)
    if (Math.abs(sumMotifs - montantRetenu) > 1) {
      return NextResponse.json({
        ok: false,
        error: `Incohérence : la somme des motifs (${sumMotifs}€) doit égaler le montant retenu (${montantRetenu}€).`,
      }, { status: 400 })
    }
  }

  // Récupère l'annonce + verify ownership + caution
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, caution, depot_restitue_at, bail_termine_at, preavis_fin_calculee")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (ann.proprietaire_email || "").toLowerCase()
  if (propEmail !== userEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }
  const locEmail = (ann.locataire_email || "").toLowerCase()
  if (!locEmail) {
    return NextResponse.json({ ok: false, error: "Pas de locataire actif" }, { status: 400 })
  }
  const caution = Number(ann.caution || 0)
  if (caution <= 0) {
    return NextResponse.json({ ok: false, error: "Pas de dépôt de garantie sur ce bail" }, { status: 400 })
  }
  if (montantRetenu > caution) {
    return NextResponse.json({
      ok: false,
      error: `Le montant retenu (${montantRetenu}€) dépasse le dépôt de garantie (${caution}€).`,
    }, { status: 400 })
  }
  if (ann.depot_restitue_at) {
    return NextResponse.json({
      ok: false,
      error: "Le dépôt de garantie a déjà été restitué pour ce bail.",
      restitueAt: ann.depot_restitue_at,
    }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const montantRestitue = caution - montantRetenu

  // 1. Update annonces
  const { error: updErr } = await supabaseAdmin
    .from("annonces")
    .update({
      depot_restitue_at: nowIso,
      depot_montant_retenu: montantRetenu,
      depot_motifs_retenue: motifsRetenue,
    })
    .eq("id", annonceId)
  if (updErr) {
    console.error("[restitution-depot] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Insert message [DEPOT_RESTITUE] dans le thread
  const messagePayload = JSON.stringify({
    annonceId,
    bienTitre: ann.titre,
    caution,
    montantRetenu,
    montantRestitue,
    motifsRetenue,
    restitueAt: nowIso,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: propEmail,
    to_email: locEmail,
    contenu: `[DEPOT_RESTITUE]${messagePayload}`,
    lu: false,
    annonce_id: annonceId,
    created_at: nowIso,
  }])

  // 3. Notif cloche locataire
  await supabaseAdmin.from("notifications").insert([{
    user_email: locEmail,
    type: "depot_restitue",
    title: montantRetenu > 0 ? "Dépôt de garantie restitué (avec retenue)" : "Dépôt de garantie restitué",
    body: montantRetenu > 0
      ? `${montantRestitue}€ vous sont restitués sur les ${caution}€ de dépôt (${montantRetenu}€ retenus pour dégradations).`
      : `Restitution intégrale de ${caution}€ pour « ${ann.titre || "votre logement"} ».`,
    href: "/mon-logement#depot",
    related_id: String(annonceId),
    created_at: nowIso,
  }])

  return NextResponse.json({
    ok: true,
    annonceId,
    caution,
    montantRetenu,
    montantRestitue,
    restitueAt: nowIso,
  })
}
