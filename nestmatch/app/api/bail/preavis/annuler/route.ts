/**
 * V69.1b — POST /api/bail/preavis/annuler
 *
 * Rétractation du préavis de congé. Locataire OU proprio peut annuler son
 * propre préavis (pas celui de l'autre partie). Réversibilité avant la
 * date de fin effective uniquement.
 *
 * Body : { annonce_id, raison? }
 *
 * Effets :
 *   1. Reset annonces.preavis_donne_par + preavis_date_envoi +
 *      preavis_motif + preavis_motif_detail + preavis_date_depart_souhaitee
 *      + preavis_fin_calculee à NULL.
 *   2. Insert message [PREAVIS_ANNULE] dans la conv (locataire ↔ proprio).
 *   3. Notif cloche autre partie + email.
 *   4. Le cron preavis-jalons (J-30/15/7/1) skipera auto car
 *      preavis_donne_par = NULL.
 *
 * Garde-fou : impossible d'annuler après la date_fin_calculee (le bail
 * est déjà terminé juridiquement).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface Body {
  annonce_id?: string | number
  raison?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // Rate-limit 3/h/user — l'annulation préavis est un acte sérieux.
  const rl = await checkRateLimitAsync(`preavis-annuler:${userEmail}`, { max: 3, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de tentatives — patientez 1h." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const annonceId = Number(body.annonce_id)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
  }
  const raison = typeof body.raison === "string" ? body.raison.trim().slice(0, 500) : ""

  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, preavis_donne_par, preavis_fin_calculee")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (ann.proprietaire_email || "").toLowerCase()
  const locEmail = (ann.locataire_email || "").toLowerCase()
  let qui: "locataire" | "proprietaire"
  if (userEmail === locEmail) qui = "locataire"
  else if (userEmail === propEmail) qui = "proprietaire"
  else return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })

  if (!ann.preavis_donne_par) {
    return NextResponse.json({ ok: false, error: "Aucun préavis en cours sur ce bail" }, { status: 400 })
  }

  // Seul l'auteur du préavis peut l'annuler
  const auteurDuPreavis = String(ann.preavis_donne_par)
  const matchAuteur =
    (auteurDuPreavis === "locataire" && qui === "locataire") ||
    (auteurDuPreavis === "proprietaire" && qui === "proprietaire") ||
    (auteurDuPreavis === "bailleur" && qui === "proprietaire")
  if (!matchAuteur) {
    return NextResponse.json({
      ok: false,
      error: "Seul l'auteur du préavis peut l'annuler.",
    }, { status: 403 })
  }

  // Vérifier que la date_fin_calculee n'est pas déjà passée
  if (ann.preavis_fin_calculee) {
    const finMs = new Date(String(ann.preavis_fin_calculee) + "T23:59:59").getTime()
    if (Number.isFinite(finMs) && finMs < Date.now()) {
      return NextResponse.json({
        ok: false,
        error: "Le préavis est déjà arrivé à terme — impossible de l'annuler.",
      }, { status: 409 })
    }
  }

  const now = new Date().toISOString()
  const autre = qui === "locataire" ? propEmail : locEmail

  // 1. Reset annonces.preavis_*
  const { error: updErr } = await supabaseAdmin
    .from("annonces")
    .update({
      preavis_donne_par: null,
      preavis_date_envoi: null,
      preavis_motif: null,
      preavis_motif_detail: null,
      preavis_date_depart_souhaitee: null,
      preavis_fin_calculee: null,
    })
    .eq("id", annonceId)
  if (updErr) {
    console.error("[preavis/annuler] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Message [PREAVIS_ANNULE]
  if (autre) {
    const payload = JSON.stringify({
      qui,
      raison: raison || null,
      annuleeAt: now,
      annonceId,
    })
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: autre,
      contenu: `[PREAVIS_ANNULE]${payload}`,
      lu: false,
      annonce_id: annonceId,
      created_at: now,
    }])

    // 3. Notif cloche autre partie
    await supabaseAdmin.from("notifications").insert([{
      user_email: autre,
      type: "preavis_annule",
      title: qui === "locataire" ? "Le locataire annule son préavis" : "Le bailleur annule son préavis",
      body: raison
        ? `« ${raison.slice(0, 80)} » — le bail continue normalement.`
        : "Le préavis a été annulé. Le bail continue normalement.",
      href: qui === "locataire" ? `/proprietaire/bail/${annonceId}` : "/mon-logement",
      related_id: String(annonceId),
      lu: false,
      created_at: now,
    }])
  }

  return NextResponse.json({ ok: true, qui, annuleeAt: now })
}
