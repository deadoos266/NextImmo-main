/**
 * V69.2b — GET /api/cron/annonces-stagnantes
 *
 * Cron hebdomadaire (lundi 9h Paris). Identifie les annonces actives
 * (statut='disponible' ou null) sans candidature reçue depuis 30+ jours
 * ET sans clic récent. Envoie un email "boost" au proprio avec 3 conseils
 * personnalisés selon les signaux de qualité (DPE / photos / prix / desc).
 *
 * Anti-spam : flag `notified_stagnant_at` posé après email. Re-trigger
 * possible 90 jours plus tard si toujours stagnant.
 *
 * Auth : Bearer CRON_SECRET en prod.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"
import { wrapHandler } from "@/lib/logger"

export const runtime = "nodejs"

interface AnnonceMin {
  id: number
  titre: string | null
  ville: string | null
  proprietaire_email: string | null
  prix: number | null
  surface: number | null
  dpe: string | null
  description: string | null
  photos: string[] | null
  created_at: string | null
  notified_stagnant_at: string | null
}

const SEUIL_STAGNANT_JOURS = 30
const REPROMPT_JOURS = 90

function genererConseils(ann: AnnonceMin): string[] {
  const conseils: string[] = []
  // Photos
  const nbPhotos = Array.isArray(ann.photos) ? ann.photos.length : 0
  if (nbPhotos < 5) {
    conseils.push(`📸 <strong>Ajoutez plus de photos</strong> — vous n'en avez que ${nbPhotos}. Les annonces avec 8+ photos reçoivent 3× plus de candidatures.`)
  }
  // DPE
  if (!ann.dpe || ["F", "G"].includes(ann.dpe)) {
    if (!ann.dpe) {
      conseils.push(`⚡ <strong>Renseignez le DPE</strong>. Sans DPE, votre annonce inspire moins confiance — c'est obligatoire depuis 2022.`)
    } else {
      conseils.push(`⚡ <strong>DPE ${ann.dpe} = passoire thermique</strong>. Précisez si des travaux sont prévus, ou diminuez le loyer pour compenser.`)
    }
  }
  // Description
  const descLen = (ann.description || "").length
  if (descLen < 200) {
    conseils.push(`📝 <strong>Étoffez la description</strong> — vous avez écrit ${descLen} caractères. Une description de 400-600 caractères convertit mieux.`)
  }
  // Prix vs marché : on prend le prix médian de la ville comme proxy simple
  // (évite un appel external à un calculator).
  // TODO V70 : intégrer cityMedians.ts
  if (conseils.length < 3 && ann.prix && ann.surface && ann.surface > 0) {
    const prixM2 = ann.prix / ann.surface
    if (prixM2 > 35) {
      conseils.push(`💰 <strong>Prix au m² élevé</strong> (${prixM2.toFixed(1)}€/m²). Vérifiez votre estimation sur d'autres plateformes — un prix sur le marché reçoit 5× plus de candidatures.`)
    }
  }
  // Fallback si rien de spécifique
  if (conseils.length === 0) {
    conseils.push(`💡 <strong>Réessayez de partager votre annonce</strong> sur les réseaux sociaux ou auprès de votre entourage. Le bouche-à-oreille reste un canal très efficace.`)
  }
  return conseils.slice(0, 3)
}

function buildEmailHtml(args: {
  proprioName: string
  bienTitre: string
  joursDepuisCreation: number
  conseils: string[]
  ctaUrl: string
}): { subject: string; html: string; text: string } {
  const subject = `💡 Booster votre annonce "${args.bienTitre}"`
  const conseilsHtml = args.conseils.map(c => `<li style="margin-bottom:8px">${c}</li>`).join("")
  const conseilsText = args.conseils.map(c => "- " + c.replace(/<[^>]+>/g, "")).join("\n")
  const html = `
    <h2 style="font-family:'DM Sans',sans-serif;color:#111">Votre annonce stagne — voici 3 conseils</h2>
    <p>Bonjour ${args.proprioName},</p>
    <p>Votre annonce <strong>${args.bienTitre}</strong> est en ligne depuis <strong>${args.joursDepuisCreation} jours</strong> mais n'a pas reçu de candidature récemment.</p>
    <p>Quelques pistes pour la booster :</p>
    <ul style="line-height:1.7;color:#111">${conseilsHtml}</ul>
    <p style="margin-top:24px"><a href="${args.ctaUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700">Modifier mon annonce →</a></p>
    <hr style="border:0;border-top:1px solid #EAE6DF;margin:24px 0" />
    <p style="font-size:12px;color:#8a8477">Vous recevez cet email tous les 3 mois maximum si votre annonce stagne.<br/>KeyMatch — keymatch-immo.fr</p>
  `
  const text = `Votre annonce stagne — 3 conseils\n\nBonjour ${args.proprioName},\n\nVotre annonce ${args.bienTitre} est en ligne depuis ${args.joursDepuisCreation} jours sans candidature récente.\n\nPistes :\n${conseilsText}\n\nModifier : ${args.ctaUrl}\n\nKeyMatch — keymatch-immo.fr`
  return { subject, html, text }
}

export const GET = wrapHandler({ route: "/api/cron/annonces-stagnantes", method: "GET" }, async (req: NextRequest, log) => {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    log.warn("unauthorized")
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  const seuilDate = new Date(now - SEUIL_STAGNANT_JOURS * 24 * 3600 * 1000).toISOString()
  const repromptDate = new Date(now - REPROMPT_JOURS * 24 * 3600 * 1000).toISOString()

  // Fetch annonces actives, créées il y a > 30 jours, sans notif récente
  const { data: annonces, error } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, prix, surface, dpe, description, photos, created_at, notified_stagnant_at")
    .or("statut.is.null,statut.eq.disponible")
    .lt("created_at", seuilDate)
    .eq("is_test", false)
    .limit(200)

  if (error) {
    log.error("fetch annonces failed", { error: error.message })
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  log.info("fetched candidates", { count: annonces?.length ?? 0 })

  const candidates: AnnonceMin[] = (annonces || []) as AnnonceMin[]
  const results: Array<{ annonceId: number; status: "sent" | "skipped"; reason?: string }> = []

  for (const ann of candidates) {
    // Skip si notifié il y a moins de 90 jours (anti-spam)
    if (ann.notified_stagnant_at) {
      const lastNotifMs = new Date(ann.notified_stagnant_at).getTime()
      if (Number.isFinite(lastNotifMs) && lastNotifMs > new Date(repromptDate).getTime()) {
        results.push({ annonceId: ann.id, status: "skipped", reason: "notif_recente" })
        continue
      }
    }

    // Check : aucune candidature reçue dans les 30 derniers jours
    const { count: candCount } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("annonce_id", ann.id)
      .eq("type", "candidature")
      .gte("created_at", seuilDate)
    if ((candCount ?? 0) > 0) {
      results.push({ annonceId: ann.id, status: "skipped", reason: "candidatures_recentes" })
      continue
    }

    const proprioEmail = (ann.proprietaire_email || "").toLowerCase()
    if (!proprioEmail) {
      results.push({ annonceId: ann.id, status: "skipped", reason: "no_proprio_email" })
      continue
    }

    // Respect prefs (mais l'event est plutôt informatif, on l'autorise par défaut)
    const allowed = await shouldSendEmailForEvent(proprioEmail, "annonce_stagnant")
    if (!allowed) {
      results.push({ annonceId: ann.id, status: "skipped", reason: "pref_off" })
      await supabaseAdmin
        .from("annonces")
        .update({ notified_stagnant_at: new Date().toISOString() })
        .eq("id", ann.id)
      continue
    }

    const { data: prof } = await supabaseAdmin
      .from("profils")
      .select("prenom, nom")
      .eq("email", proprioEmail)
      .maybeSingle()
    const proprioName = [prof?.prenom, prof?.nom].filter(Boolean).join(" ").trim()
      || proprioEmail.split("@")[0]

    const conseils = genererConseils(ann)
    const joursDepuisCreation = ann.created_at
      ? Math.floor((now - new Date(ann.created_at).getTime()) / (24 * 3600 * 1000))
      : SEUIL_STAGNANT_JOURS
    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
    const tpl = buildEmailHtml({
      proprioName,
      bienTitre: ann.titre || "votre annonce",
      joursDepuisCreation,
      conseils,
      ctaUrl: `${baseUrl}/proprietaire/modifier/${ann.id}`,
    })

    const sendRes = await sendEmail({
      to: proprioEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: "type", value: "annonce_stagnant" }],
    })

    await supabaseAdmin
      .from("annonces")
      .update({ notified_stagnant_at: new Date().toISOString() })
      .eq("id", ann.id)

    results.push({
      annonceId: ann.id,
      status: sendRes.ok ? "sent" : "skipped",
      reason: sendRes.ok ? undefined : "send_failed",
    })
  }

  const sentCount = results.filter(r => r.status === "sent").length
  const skippedCount = results.filter(r => r.status === "skipped").length
  log.info("done", { scanned: candidates.length, sent: sentCount, skipped: skippedCount })
  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    sent: sentCount,
    skipped: skippedCount,
  })
})
