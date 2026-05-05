/**
 * V69.1a — POST /api/visites/annuler
 *
 * Annulation d'une visite confirmée (empêchement, urgence, autre).
 * Locataire OU proprio peut annuler. Différent de "refuser" qui décline
 * une proposition pas encore confirmée.
 *
 * Body : { visite_id, raison }
 *
 * Effets :
 *   1. Update visites.statut = 'annulee'
 *   2. Insert message [VISITE_ANNULEE] dans la conv
 *   3. Notif cloche autre partie + email V52
 *
 * Auth : NextAuth + check participant.
 * Rate-limit : 5/h/user (anti-abus, l'annulation est un acte plus sérieux).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface Body {
  visite_id?: string | number
  raison?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`visite-annuler:${userEmail}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop d'annulations récentes — patientez 1h." },
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
  const raison = typeof body.raison === "string" ? body.raison.trim().slice(0, 500) : ""

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

  if (visite.statut === "annulee" || visite.statut === "refusee") {
    return NextResponse.json({ ok: false, error: `Visite déjà ${visite.statut}` }, { status: 409 })
  }
  if (visite.statut === "effectuee") {
    return NextResponse.json({ ok: false, error: "Visite déjà effectuée — impossible d'annuler" }, { status: 409 })
  }

  const role: "locataire" | "proprietaire" = userEmail === locEmail ? "locataire" : "proprietaire"
  const autre = role === "locataire" ? propEmail : locEmail
  const now = new Date().toISOString()

  // 1. Update visite
  const { error: updErr } = await supabaseAdmin
    .from("visites")
    .update({ statut: "annulee" })
    .eq("id", visiteId)
  if (updErr) {
    console.error("[visites/annuler] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Message [VISITE_ANNULEE] dans la conv
  const dateFr = visite.date_visite
    ? new Date(String(visite.date_visite) + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : ""
  const payload = JSON.stringify({
    visiteId,
    role,
    raison: raison || null,
    annuleeAt: now,
    dateVisite: dateFr,
    heure: visite.heure,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: userEmail,
    to_email: autre,
    contenu: `[VISITE_ANNULEE]${payload}`,
    lu: false,
    annonce_id: visite.annonce_id,
    created_at: now,
  }])

  // 3. Notif cloche
  await supabaseAdmin.from("notifications").insert([{
    user_email: autre,
    type: "visite_annulee",
    title: role === "locataire" ? "Visite annulée par le locataire" : "Visite annulée par le bailleur",
    body: `${dateFr ? `${dateFr} ${visite.heure || ""} — ` : ""}${raison ? `« ${raison.slice(0, 80)} »` : "Visite annulée."}`,
    href: "/visites",
    related_id: String(visiteId),
    lu: false,
    created_at: now,
  }])

  return NextResponse.json({ ok: true, visiteId, annuleeAt: now })
}
