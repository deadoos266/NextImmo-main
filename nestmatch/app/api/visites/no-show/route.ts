/**
 * V70.3 — POST /api/visites/no-show
 *
 * Marquer qu'une partie n'est pas venue à une visite confirmée. Disponible
 * J+1 après date_visite (le jour même = trop tôt, peut être en retard).
 *
 * Body : { visite_id, partie_absente: 'locataire' | 'proprio' }
 *
 * Effets :
 *   1. Update visites.statut = 'no_show' + flag partie_absente.
 *   2. Si partie_absente = 'locataire' : incrémente profils.no_show_count
 *      sur le locataire (impact recommandation matching V70.3).
 *   3. Insert message [VISITE_NO_SHOW] dans la conv.
 *   4. Notif l'autre partie + email.
 *
 * Sécurité : NextAuth + check participant. Seule l'AUTRE partie peut
 * signaler le no-show (le locataire ne peut pas marquer son propre
 * absence; le proprio ne peut pas marquer sa propre absence).
 *
 * Anti-abus : rate-limit 5/h/user, et un seul no-show par visite (status
 * change immutable).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface Body {
  visite_id?: string | number
  partie_absente?: "locataire" | "proprio"
}

const NO_SHOW_DELAY_MS = 24 * 3600 * 1000 // J+1 minimum après date_visite

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`visite-noshow:${userEmail}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de signalements no-show récents — patientez 1h." },
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
  const partieAbsente = body.partie_absente
  if (partieAbsente !== "locataire" && partieAbsente !== "proprio") {
    return NextResponse.json({ ok: false, error: "partie_absente doit être 'locataire' ou 'proprio'" }, { status: 400 })
  }

  // Lookup visite
  const { data: visite } = await supabaseAdmin
    .from("visites")
    .select("id, annonce_id, locataire_email, proprietaire_email, statut, date_visite, heure")
    .eq("id", visiteId)
    .maybeSingle()
  if (!visite) {
    return NextResponse.json({ ok: false, error: "Visite introuvable" }, { status: 404 })
  }

  if (visite.statut !== "confirmee" && visite.statut !== "confirmée") {
    return NextResponse.json({
      ok: false,
      error: "Seule une visite confirmée peut être marquée no-show.",
    }, { status: 409 })
  }

  // Délai J+1 après date_visite (combiné date + heure si dispo)
  if (!visite.date_visite) {
    return NextResponse.json({ ok: false, error: "Visite sans date — impossible" }, { status: 400 })
  }
  const visiteDateTime = visite.heure
    ? new Date(`${visite.date_visite}T${visite.heure}:00`)
    : new Date(`${visite.date_visite}T12:00:00`)
  const elapsed = Date.now() - visiteDateTime.getTime()
  if (elapsed < NO_SHOW_DELAY_MS) {
    return NextResponse.json({
      ok: false,
      error: "Vous devez attendre au moins 24h après l'heure de la visite pour la signaler no-show.",
    }, { status: 400 })
  }

  const locEmail = (visite.locataire_email || "").toLowerCase()
  const propEmail = (visite.proprietaire_email || "").toLowerCase()

  // Seul le participant OPPOSÉ à la partie absente peut signaler
  let signaleur: "locataire" | "proprio"
  if (userEmail === locEmail) signaleur = "locataire"
  else if (userEmail === propEmail) signaleur = "proprio"
  else return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })

  if (signaleur === partieAbsente) {
    return NextResponse.json({
      ok: false,
      error: "Vous ne pouvez pas signaler votre propre absence.",
    }, { status: 400 })
  }

  const now = new Date().toISOString()

  // 1. Update visite
  const { error: updErr } = await supabaseAdmin
    .from("visites")
    .update({
      statut: "no_show",
      no_show_partie: partieAbsente,
      no_show_signale_par: signaleur,
      no_show_signale_at: now,
    })
    .eq("id", visiteId)
  if (updErr) {
    console.error("[visites/no-show] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Si locataire absent : incrémente profils.no_show_count (impact reco)
  if (partieAbsente === "locataire" && locEmail) {
    try {
      const { data: locProf } = await supabaseAdmin
        .from("profils")
        .select("no_show_count")
        .eq("email", locEmail)
        .maybeSingle()
      const cur = Number(locProf?.no_show_count ?? 0)
      await supabaseAdmin
        .from("profils")
        .upsert({ email: locEmail, no_show_count: cur + 1 }, { onConflict: "email" })
    } catch (e) {
      console.warn("[visites/no-show] incr no_show_count failed", e)
    }
  }

  // 3. Message [VISITE_NO_SHOW]
  const autre = signaleur === "locataire" ? propEmail : locEmail
  const dateFr = new Date(`${visite.date_visite}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  })
  const payload = JSON.stringify({
    visiteId,
    partieAbsente,
    signalePar: signaleur,
    dateVisite: dateFr,
    heure: visite.heure,
    signaleAt: now,
  })
  if (autre) {
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: autre,
      contenu: `[VISITE_NO_SHOW]${payload}`,
      lu: false,
      annonce_id: visite.annonce_id,
      created_at: now,
    }])
    await supabaseAdmin.from("notifications").insert([{
      user_email: autre,
      type: "visite_no_show",
      title: partieAbsente === "locataire"
        ? "Visite signalée comme no-show"
        : "Visite signalée — vous avez été marqué·e absent·e",
      body: `${dateFr}${visite.heure ? ` à ${visite.heure}` : ""} — vous pouvez contester si nécessaire.`,
      href: "/visites",
      related_id: String(visiteId),
      lu: false,
      created_at: now,
    }])
  }

  return NextResponse.json({
    ok: true,
    visiteId,
    partieAbsente,
    signaleAt: now,
  })
}
