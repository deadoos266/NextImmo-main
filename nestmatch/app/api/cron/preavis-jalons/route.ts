/**
 * V38.6 — GET /api/cron/preavis-jalons
 * Audit V37 R37.7 + R37.8 :
 * - Notif aux 2 parties à J-30, J-15, J-7, J-1 du `preavis_fin_calculee`.
 * - Auto-trigger visite EDL sortie à J-7 (si pas déjà créée).
 *
 * Cron Vercel : 0 8 * * *  (tous les jours 8h UTC). Idempotent — safe
 * à re-exécuter (check `notifications` dédup + check existing `visites`).
 *
 * Auth : Bearer CRON_SECRET en prod.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { joursAvantFinPreavis, jalonNotif } from "@/lib/preavis"

interface AnnonceWithPreavis {
  id: number
  titre: string | null
  proprietaire_email: string | null
  locataire_email: string | null
  preavis_donne_par: string | null
  preavis_fin_calculee: string | null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // Récupère les annonces avec un préavis donné et fin pas encore atteinte
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const horizonIso = new Date(today.getTime() + 35 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const { data: annonces, error } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, proprietaire_email, locataire_email, preavis_donne_par, preavis_fin_calculee")
    .not("preavis_fin_calculee", "is", null)
    .gte("preavis_fin_calculee", todayIso)
    .lte("preavis_fin_calculee", horizonIso)
  if (error) {
    console.error("[cron/preavis-jalons] fetch error", error)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }

  const stats = { processed: 0, jalonsSent: 0, edlCreated: 0, errors: 0 }

  for (const ann of (annonces || []) as AnnonceWithPreavis[]) {
    if (!ann.preavis_fin_calculee || !ann.proprietaire_email || !ann.locataire_email) continue
    stats.processed++
    const jours = joursAvantFinPreavis(ann.preavis_fin_calculee, today)
    const jalon = jalonNotif(jours)

    // 1. Jalons J-30 / J-15 / J-7 / J-1
    if (jalon !== null) {
      // Idempotence : check si une notif jalon-X a déjà été envoyée à l'une
      // des 2 parties pour cette annonce. Type "preavis_jalon_X" pour
      // permettre dedup par jour (impossible de re-créer le même jour).
      const notifType = `preavis_jalon_${jalon}`
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("type", notifType)
        .eq("related_id", String(ann.id))
        .limit(1)
        .maybeSingle()

      if (!existing) {
        const dateFinFr = new Date(ann.preavis_fin_calculee).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        const titre = jalon === 1
          ? `Bail termine demain — ${ann.titre || "votre logement"}`
          : `Bail termine dans ${jalon} jours — ${ann.titre || "votre logement"}`
        const bodyLoc = jalon === 7
          ? `Fin de bail le ${dateFinFr}. État des lieux de sortie à planifier (créé automatiquement dans vos visites).`
          : `Fin de bail le ${dateFinFr}. ${jalon === 1 ? "Préparez la remise des clés et l'EDL de sortie." : "Préparez votre déménagement / EDL sortie."}`
        const bodyProp = jalon === 7
          ? `Fin de bail le ${dateFinFr}. État des lieux de sortie créé automatiquement.`
          : `Fin de bail le ${dateFinFr}. ${jalon === 1 ? "Préparez l'EDL de sortie et la remise des clés." : "Vérifiez la disponibilité du locataire pour l'EDL sortie."}`

        try {
          await supabaseAdmin.from("notifications").insert([
            {
              user_email: ann.locataire_email.toLowerCase(),
              type: notifType,
              title: titre,
              body: bodyLoc,
              href: "/mon-logement",
              related_id: String(ann.id),
              lu: false,
              created_at: new Date().toISOString(),
            },
            {
              user_email: ann.proprietaire_email.toLowerCase(),
              type: notifType,
              title: titre,
              body: bodyProp,
              href: `/proprietaire/bail/${ann.id}`,
              related_id: String(ann.id),
              lu: false,
              created_at: new Date().toISOString(),
            },
          ])
          stats.jalonsSent += 2
        } catch (e) {
          console.warn(`[cron/preavis-jalons] notif insert failed for annonce ${ann.id}:`, e)
          stats.errors++
        }
      }
    }

    // 2. Auto-trigger EDL sortie à J-7 (et seulement à J-7, idempotent par
    // check `visites` existing avec annonce_id + statut + type sortie).
    if (jours === 7) {
      // Check si une visite EDL sortie n'existe pas déjà pour cette annonce.
      // On utilise un libellé marker dans `commentaire` ou check date.
      const { data: existingEdl } = await supabaseAdmin
        .from("visites")
        .select("id")
        .eq("annonce_id", ann.id)
        .ilike("commentaire", "%EDL sortie%")
        .limit(1)
        .maybeSingle()

      if (!existingEdl) {
        // Créé une visite EDL sortie au date_fin_preavis (= jour de fin de bail)
        // à 14h par défaut. L'user peut la déplacer ensuite.
        const dateEdl = ann.preavis_fin_calculee
        try {
          await supabaseAdmin.from("visites").insert({
            annonce_id: ann.id,
            proprietaire_email: ann.proprietaire_email.toLowerCase(),
            locataire_email: ann.locataire_email.toLowerCase(),
            date_visite: dateEdl,
            heure: "14:00",
            statut: "proposée",
            propose_par: ann.proprietaire_email.toLowerCase(),
            commentaire: "EDL sortie — créé automatiquement à J-7 du préavis",
            created_at: new Date().toISOString(),
          })
          stats.edlCreated++
        } catch (e) {
          console.warn(`[cron/preavis-jalons] EDL visite insert failed for annonce ${ann.id}:`, e)
          stats.errors++
        }
      }
    }
  }

  return NextResponse.json({ ok: true, stats, today: todayIso })
}
