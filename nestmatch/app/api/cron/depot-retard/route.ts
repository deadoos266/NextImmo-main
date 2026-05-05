/**
 * V69.2a — GET /api/cron/depot-retard
 *
 * Cron quotidien (9h Paris). Identifie les baux terminés où le dépôt de
 * garantie n'a pas été restitué dans les délais légaux ALUR :
 *   - 1 mois si pas de retenue (loi 89-462 art. 22)
 *   - 2 mois si retenue motivée
 *
 * Pour chaque locataire concerné, envoie un email + notif "Procédure ADIL
 * applicable" avec lien vers le médiateur. Une seule notif par bail (flag
 * `notified_depot_retard_at` côté annonce — anti-spam).
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * NB : ne tape que les annonces avec `bail_termine_at IS NOT NULL` et
 * `caution > 0` ET `depot_restitue_at IS NULL`. Les annonces déjà
 * relouées (statut=disponible après reset) sont aussi captées si elles
 * ont `depot_restitue_at` toujours null — mais V67/V69.1f impose la
 * restitution avant relouer, donc cas rare en pratique.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"
import { wrapHandler } from "@/lib/logger"

export const runtime = "nodejs"

interface BailRetard {
  id: number
  titre: string | null
  ville: string | null
  proprietaire_email: string | null
  locataire_email: string | null
  locataire_email_at_end: string | null
  caution: number | null
  bail_termine_at: string | null
  depot_montant_retenu: number | null
}

const ADIL_URL = "https://www.adil.org/"
const ANIL_RECHERCHE = "https://www.anil.org/lanil-et-les-adil/votre-adil/"

function depotRetardEmailHtml(args: {
  locataireName: string
  bienTitre: string
  ville: string | null
  bailTermineAt: string
  caution: number
  joursRetard: number
  delaiLegalMois: number
  proprioEmail: string
}): { subject: string; html: string; text: string } {
  const villeStr = args.ville ? ` à ${args.ville}` : ""
  const subject = `⏱ Dépôt de garantie en retard — ${args.bienTitre}${villeStr}`
  const html = `
    <h2 style="font-family:'DM Sans',sans-serif;color:#111">Dépôt de garantie non restitué</h2>
    <p>Bonjour ${args.locataireName},</p>
    <p>Votre bail pour <strong>${args.bienTitre}</strong>${villeStr} s'est terminé le <strong>${args.bailTermineAt}</strong>.</p>
    <p>Le délai légal de restitution du dépôt de garantie de <strong>${args.caution.toLocaleString("fr-FR")} €</strong> est de <strong>${args.delaiLegalMois} mois</strong> (article 22 de la loi du 6 juillet 1989).</p>
    <p>À ce jour, vous êtes <strong>${args.joursRetard} jour${args.joursRetard > 1 ? "s" : ""}</strong> au-delà de ce délai.</p>
    <h3 style="font-family:'DM Sans',sans-serif;color:#111;margin-top:24px">Vos recours</h3>
    <ol>
      <li>Mettez en demeure votre bailleur par lettre recommandée avec AR.</li>
      <li>Saisissez la <a href="${ANIL_RECHERCHE}" style="color:#1d4ed8">commission de conciliation départementale</a> (gratuit, ANIL).</li>
      <li>Si non résolu, saisissez le tribunal judiciaire — vous pouvez réclamer une majoration de 10% du loyer mensuel par mois de retard (loi ALUR).</li>
    </ol>
    <p style="margin-top:24px"><a href="${ADIL_URL}" style="color:#111;text-decoration:underline">En savoir plus sur vos droits — ADIL</a></p>
    <hr style="border:0;border-top:1px solid #EAE6DF;margin:24px 0" />
    <p style="font-size:12px;color:#8a8477">Bailleur : ${args.proprioEmail}<br/>KeyMatch — keymatch-immo.fr</p>
  `
  const text = `Dépôt de garantie non restitué\n\nBonjour ${args.locataireName},\n\nVotre bail pour ${args.bienTitre}${villeStr} s'est terminé le ${args.bailTermineAt}.\n\nLe délai légal de restitution du dépôt de garantie de ${args.caution}€ est de ${args.delaiLegalMois} mois (article 22 loi 89-462). Vous êtes ${args.joursRetard} jour(s) au-delà.\n\nRecours :\n1. Mise en demeure LRAR\n2. Commission de conciliation ANIL : ${ANIL_RECHERCHE}\n3. Tribunal judiciaire (majoration 10% par mois de retard, loi ALUR)\n\nADIL : ${ADIL_URL}\n\nBailleur : ${args.proprioEmail}\nKeyMatch — keymatch-immo.fr`
  return { subject, html, text }
}

export const GET = wrapHandler({ route: "/api/cron/depot-retard", method: "GET" }, async (req: NextRequest, log) => {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    log.warn("unauthorized")
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()

  // Fetch baux terminés avec dépôt non restitué
  const { data: baux, error } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, locataire_email_at_end, caution, bail_termine_at, depot_montant_retenu, notified_depot_retard_at")
    .not("bail_termine_at", "is", null)
    .is("depot_restitue_at", null)
    .gt("caution", 0)
    .is("notified_depot_retard_at", null) // anti-spam : 1 notif/bail
    .limit(200)

  if (error) {
    log.error("fetch baux failed", { error: error.message })
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  log.info("fetched candidates", { count: baux?.length ?? 0 })

  const concernes: BailRetard[] = (baux || []) as BailRetard[]
  const results: Array<{ annonceId: number; status: "sent" | "skipped"; reason?: string }> = []

  for (const b of concernes) {
    if (!b.bail_termine_at) continue
    const termineMs = new Date(b.bail_termine_at).getTime()
    if (!Number.isFinite(termineMs)) continue
    const joursEcoules = Math.floor((now - termineMs) / (24 * 3600 * 1000))

    // Délai légal : 1 mois (=30j) si pas de retenue, 2 mois (=60j) si retenue motivée
    const delaiLegalJours = (Number(b.depot_montant_retenu) || 0) > 0 ? 60 : 30
    const delaiLegalMois = delaiLegalJours / 30

    if (joursEcoules < delaiLegalJours) {
      continue // pas encore en retard légal
    }

    const locataireEmail = (b.locataire_email || b.locataire_email_at_end || "").toLowerCase()
    if (!locataireEmail) {
      results.push({ annonceId: b.id, status: "skipped", reason: "no_locataire_email" })
      continue
    }

    // Respect prefs notif
    const allowed = await shouldSendEmailForEvent(locataireEmail, "depot_retard")
    if (!allowed) {
      results.push({ annonceId: b.id, status: "skipped", reason: "pref_off" })
      // On marque quand même comme notifié pour ne pas spammer la cloche
      await supabaseAdmin
        .from("annonces")
        .update({ notified_depot_retard_at: new Date().toISOString() })
        .eq("id", b.id)
      continue
    }

    // Profil locataire pour personnalisation email
    const { data: loc } = await supabaseAdmin
      .from("profils")
      .select("prenom, nom")
      .eq("email", locataireEmail)
      .maybeSingle()
    const locataireName = [loc?.prenom, loc?.nom].filter(Boolean).join(" ").trim()
      || locataireEmail.split("@")[0]

    const tpl = depotRetardEmailHtml({
      locataireName,
      bienTitre: b.titre || "votre logement",
      ville: b.ville,
      bailTermineAt: b.bail_termine_at.slice(0, 10),
      caution: Number(b.caution || 0),
      joursRetard: joursEcoules - delaiLegalJours,
      delaiLegalMois,
      proprioEmail: b.proprietaire_email || "votre bailleur",
    })

    const sendRes = await sendEmail({
      to: locataireEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: "type", value: "depot_retard" }],
    })

    // Notif cloche locataire
    await supabaseAdmin.from("notifications").insert([{
      user_email: locataireEmail,
      type: "depot_retard",
      title: "Dépôt de garantie en retard",
      body: `Votre bailleur n'a pas restitué votre dépôt de ${b.caution}€. Recours possibles via la procédure ADIL.`,
      href: ADIL_URL,
      related_id: String(b.id),
      lu: false,
      created_at: new Date().toISOString(),
    }])

    // Marque comme notifié pour anti-spam
    await supabaseAdmin
      .from("annonces")
      .update({ notified_depot_retard_at: new Date().toISOString() })
      .eq("id", b.id)

    results.push({
      annonceId: b.id,
      status: sendRes.ok ? "sent" : "skipped",
      reason: sendRes.ok ? undefined : "send_failed",
    })
  }

  const sentCount = results.filter(r => r.status === "sent").length
  const skippedCount = results.filter(r => r.status === "skipped").length
  log.info("done", { scanned: concernes.length, sent: sentCount, skipped: skippedCount })
  return NextResponse.json({
    ok: true,
    scanned: concernes.length,
    sent: sentCount,
    skipped: skippedCount,
    results,
  })
})
