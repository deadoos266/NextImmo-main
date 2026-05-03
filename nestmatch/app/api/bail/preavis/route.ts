/**
 * V34.5 — POST /api/bail/preavis
 * Donner congé sur un bail actif (locataire OU proprio).
 *
 * Body : {
 *   annonceId: number,
 *   motif: LocataireMotif | ProprietaireMotif,
 *   detail?: string,
 *   dateDepartSouhaitee?: string  // ISO YYYY-MM-DD
 * }
 *
 * Side-effects :
 * - Update annonces.preavis_donne_par + preavis_date_envoi + preavis_motif
 *   + preavis_motif_detail + preavis_date_depart_souhaitee + preavis_fin_calculee.
 * - Insert message [PREAVIS] dans le thread.
 * - Notif cloche à l'autre partie + email Resend.
 *
 * Auth : NextAuth + match locataire OU proprio de l'annonce.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { preavisDonneTemplate } from "@/lib/email/templates"
import { displayName } from "@/lib/privacy"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"
import { calculerPreavis, LOCATAIRE_MOTIFS, PROPRIETAIRE_MOTIFS, type LocataireMotif, type ProprietaireMotif } from "@/lib/preavis"
import { estZoneTendue } from "@/lib/bailDefaults"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // V64 — rate-limit : 3 préavis/h/user (anti-script). Un préavis est un
  // acte juridique fort qui déclenche email + notif + update DB ; la double
  // sécurité (`preavis_donne_par` non-null bloque déjà), mais on ajoute
  // ceinture+bretelle pour éviter le flood d'emails sur un bail donné.
  const rl = await checkRateLimitAsync(`preavis:${userEmail}`, {
    max: 3,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de tentatives, réessayez plus tard" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const p = body as { annonceId?: unknown; motif?: unknown; detail?: unknown; dateDepartSouhaitee?: unknown }
  const annonceId = Number(p.annonceId)
  const motif = typeof p.motif === "string" ? p.motif : ""
  const detail = typeof p.detail === "string" ? p.detail.trim().slice(0, 500) : ""
  const dateDepartSouhaiteeRaw = typeof p.dateDepartSouhaitee === "string" ? p.dateDepartSouhaitee : null

  if (!Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  if (!motif) {
    return NextResponse.json({ ok: false, error: "motif requis" }, { status: 400 })
  }

  const { data: annonce, error: errAnn } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, meuble, statut, bail_signe_locataire_at, bail_signe_bailleur_at, preavis_donne_par")
    .eq("id", annonceId)
    .single()
  if (errAnn || !annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  let qui: "locataire" | "proprietaire"
  if (userEmail === locEmail) qui = "locataire"
  else if (userEmail === propEmail) qui = "proprietaire"
  else return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })

  // Le bail doit être actif (au moins une signature locataire)
  if (!annonce.bail_signe_locataire_at) {
    return NextResponse.json({ ok: false, error: "Aucun bail actif sur cette annonce" }, { status: 400 })
  }
  // Pas de double-préavis
  if (annonce.preavis_donne_par) {
    return NextResponse.json({ ok: false, error: `Un préavis a déjà été donné par ${annonce.preavis_donne_par}` }, { status: 409 })
  }

  // Validation motif selon role
  const motifLabels = qui === "locataire" ? LOCATAIRE_MOTIFS : PROPRIETAIRE_MOTIFS
  const motifEntry = motifLabels.find(m => m.code === motif)
  if (!motifEntry) {
    return NextResponse.json({ ok: false, error: "Motif invalide pour ce rôle" }, { status: 400 })
  }

  // Calcul délai légal
  const dateEnvoi = new Date()
  const zoneTendue = estZoneTendue(annonce.ville || "")
  const dateDepartSouhaitee = dateDepartSouhaiteeRaw ? new Date(dateDepartSouhaiteeRaw) : null
  const preavis = calculerPreavis({
    qui,
    meuble: !!annonce.meuble,
    zoneTendue,
    motifLocataire: qui === "locataire" ? (motif as LocataireMotif) : undefined,
    dateEnvoi,
    dateDepartSouhaitee: dateDepartSouhaitee && !Number.isNaN(dateDepartSouhaitee.getTime()) ? dateDepartSouhaitee : null,
  })

  // Update annonce
  const { error: updErr } = await supabaseAdmin
    .from("annonces")
    .update({
      preavis_donne_par: qui,
      preavis_date_envoi: dateEnvoi.toISOString(),
      preavis_motif: motif,
      preavis_motif_detail: detail || null,
      preavis_date_depart_souhaitee: dateDepartSouhaitee && !Number.isNaN(dateDepartSouhaitee.getTime())
        ? dateDepartSouhaitee.toISOString().slice(0, 10) : null,
      preavis_fin_calculee: preavis.dateFinEffective.toISOString().slice(0, 10),
    })
    .eq("id", annonceId)
  if (updErr) {
    console.error("[bail/preavis] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // Message in-app + notif
  const autre = qui === "locataire" ? propEmail : locEmail
  const dateFinFr = preavis.dateFinEffective.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  const payload = JSON.stringify({
    qui,
    motif,
    motifLabel: motifEntry.label,
    detail,
    dateFin: preavis.dateFinEffective.toISOString().slice(0, 10),
    delaiMois: preavis.delaiMois,
    annonceId,
  })

  if (autre) {
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: autre,
      contenu: `[PREAVIS]${payload}`,
      lu: false,
      annonce_id: annonceId,
      created_at: dateEnvoi.toISOString(),
    }])
    await supabaseAdmin.from("notifications").insert([{
      user_email: autre,
      type: "preavis_donne",
      title: qui === "locataire" ? "Le locataire a donné congé" : "Le bailleur a donné congé",
      body: `Fin de bail prévue le ${dateFinFr} (préavis ${preavis.delaiMois} mois).`,
      href: qui === "locataire" ? `/proprietaire/bail/${annonceId}` : "/mon-logement",
      related_id: String(annonceId),
      lu: false,
      created_at: dateEnvoi.toISOString(),
    }])

    // V53.9 — Email Resend rebrandé V34.1 via preavisDonneTemplate.
    // V54.2 — preavis_donne est `required: true` (signal légal), donc
    // shouldSendEmailForEvent retournera toujours true. On l'appelle pour
    // cohérence et future extensibilité.
    try {
      const allowed = await shouldSendEmailForEvent(autre, "preavis_donne")
      if (!allowed) {
        return NextResponse.json({
          ok: true,
          qui,
          delaiMois: preavis.delaiMois,
          dateFin: preavis.dateFinEffective.toISOString().slice(0, 10),
          bonus: preavis.bonus,
          emailSkipped: "pref_off",
        })
      }
      // Récupère nom expéditeur depuis profils pour humaniser l'email
      const { data: senderProf } = await supabaseAdmin
        .from("profils")
        .select("prenom, nom")
        .eq("email", userEmail)
        .maybeSingle()
      const fromName = [senderProf?.prenom, senderProf?.nom].filter(Boolean).join(" ").trim()
        || displayName(userEmail, null)
        || (qui === "locataire" ? "Le locataire" : "Le bailleur")
      const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
      const tpl = preavisDonneTemplate({
        qui,
        fromName,
        bienTitre: annonce.titre || "Logement",
        ville: (annonce as { ville?: string | null }).ville ?? null,
        motifLabel: motifEntry.label,
        detail: detail || null,
        dateFinFr,
        delaiMois: preavis.delaiMois,
        bonus: preavis.bonus || null,
        convUrl: `${base}/messages?with=${encodeURIComponent(autre)}&annonce=${annonceId}`,
      })
      await sendEmail({
        to: autre,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [{ name: "type", value: "preavis_donne" }, { name: "qui", value: qui }],
        senderEmail: userEmail, // V50.1
      })
    } catch (e) {
      console.warn("[bail/preavis] email send failed (non bloquant):", e)
    }
  }

  return NextResponse.json({
    ok: true,
    qui,
    delaiMois: preavis.delaiMois,
    dateFin: preavis.dateFinEffective.toISOString().slice(0, 10),
    bonus: preavis.bonus,
  })
}
