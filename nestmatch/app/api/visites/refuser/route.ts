/**
 * V69.1a — POST /api/visites/refuser
 *
 * Refus d'une demande de visite proposée. Locataire OU proprio peut refuser
 * (l'autre partie peut décliner le créneau proposé).
 *
 * Body : { visite_id, raison_motif?, message? }
 *
 * Effets :
 *   1. Update visites.statut = 'refusee'
 *   2. Insert message [VISITE_REFUSEE] dans la conv (annonce + parties)
 *   3. Notif cloche autre partie + email V53 si pref activée
 *
 * Auth : NextAuth + check participant (locataire OU proprio de la visite).
 * Rate-limit : 10/h/user (anti-spam refus).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

const RAISON_LABELS: Record<string, string> = {
  creneau_indispo: "Créneau non disponible",
  bien_indisponible: "Bien plus disponible",
  autre_candidat: "Autre candidat retenu",
  changement_avis: "Changement d'avis",
  autre: "Autre raison",
}

interface Body {
  visite_id?: string | number
  raison_motif?: string
  message?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`visite-refuser:${userEmail}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de refus récents — patientez 1h." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const visiteId = Number(body.visite_id)
  if (!Number.isFinite(visiteId) || visiteId <= 0) {
    return NextResponse.json({ ok: false, error: "visite_id invalide" }, { status: 400 })
  }
  const raison = typeof body.raison_motif === "string" && body.raison_motif in RAISON_LABELS
    ? body.raison_motif
    : "autre"
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : ""

  // Lookup visite + check participant
  const { data: visite } = await supabaseAdmin
    .from("visites")
    .select("id, annonce_id, locataire_email, proprietaire_email, statut, date_visite, heure")
    .eq("id", visiteId)
    .maybeSingle()
  if (!visite) {
    return NextResponse.json({ ok: false, error: "Visite introuvable" }, { status: 404 })
  }

  const locEmail = (visite.locataire_email || "").toLowerCase()
  const propEmail = (visite.proprietaire_email || "").toLowerCase()
  if (userEmail !== locEmail && userEmail !== propEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }

  if (visite.statut === "refusee" || visite.statut === "annulee") {
    return NextResponse.json({ ok: false, error: `Visite déjà ${visite.statut}` }, { status: 409 })
  }
  if (visite.statut === "effectuee") {
    return NextResponse.json({ ok: false, error: "Visite déjà effectuée" }, { status: 409 })
  }

  const role: "locataire" | "proprietaire" = userEmail === locEmail ? "locataire" : "proprietaire"
  const autre = role === "locataire" ? propEmail : locEmail
  const now = new Date().toISOString()

  // 1. Update visite
  const { error: updErr } = await supabaseAdmin
    .from("visites")
    .update({ statut: "refusee" })
    .eq("id", visiteId)
  if (updErr) {
    console.error("[visites/refuser] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Message [VISITE_REFUSEE] dans la conv
  const dateFr = visite.date_visite
    ? new Date(String(visite.date_visite) + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : ""
  const payload = JSON.stringify({
    visiteId,
    role,
    raison,
    raisonLabel: RAISON_LABELS[raison],
    message: message || null,
    refuseeAt: now,
    dateVisite: dateFr,
    heure: visite.heure,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: userEmail,
    to_email: autre,
    contenu: `[VISITE_REFUSEE]${payload}`,
    lu: false,
    annonce_id: visite.annonce_id,
    created_at: now,
  }])

  // 3. Notif cloche autre partie
  await supabaseAdmin.from("notifications").insert([{
    user_email: autre,
    type: "visite_refusee",
    title: role === "locataire" ? "Visite refusée par le locataire" : "Visite refusée par le bailleur",
    body: `${RAISON_LABELS[raison]}${dateFr ? ` — créneau ${dateFr} ${visite.heure || ""}` : ""}`,
    href: "/visites",
    related_id: String(visiteId),
    lu: false,
    created_at: now,
  }])

  return NextResponse.json({ ok: true, visiteId, raison, refuseeAt: now })
}
