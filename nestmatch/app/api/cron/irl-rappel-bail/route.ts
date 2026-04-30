/**
 * V53.8 — GET /api/cron/irl-rappel-bail
 *
 * Cron trimestriel (1×/trimestre) : pour chaque bail actif (statut='loué'),
 * si l'anniversaire approche (±30 jours), envoie un email au proprio
 * "Indice IRL [trimestre] publié — révisez votre loyer".
 *
 * Distinct du cron `check-irl` (qui vérifie juste la fraîcheur de
 * IRL_HISTORIQUE). Celui-ci NOTIFIE les proprios.
 *
 * Schedule recommandé : `0 9 6 1,4,7,10 *` (J+1 après le check-irl, qui
 * tourne le 5).
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * Idempotent : check `annonces.notif_irl_envoye_at` pour ne pas re-spam.
 * Si la migration n'est pas encore appliquée, on fallback sur la date
 * de dernière indexation (annonces.irl_derniere_indexation_at) — un proprio qui vient
 * d'indexer ne reçoit pas de notif.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { irlIndexationProposalTemplate } from "@/lib/email/templates"
import { IRL_HISTORIQUE } from "@/lib/irl"
import { shouldSendEmailForEvent } from "@/lib/notifPreferences"

interface BailRow {
  id: number
  titre: string | null
  ville: string | null
  proprietaire_email: string | null
  prix: number | null
  charges: number | null
  date_debut_bail: string | null
  irl_derniere_indexation_at: string | null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const last = IRL_HISTORIQUE[0]
  const trimestre = last.trimestre || `T? ${new Date().getFullYear()}`

  // Récupère tous les bails actifs avec date_debut_bail
  const { data: anns, error } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, prix, charges, date_debut_bail, irl_derniere_indexation_at")
    .eq("statut", "loué")
    .not("date_debut_bail", "is", null)
  if (error) {
    console.error("[cron/irl-rappel-bail] fetch error:", error)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }
  const list = (anns || []) as BailRow[]

  const stats = { scanned: list.length, envoyes: 0, skipped: 0, errors: 0 }
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  const now = new Date()
  const thisYear = now.getFullYear()

  for (const b of list) {
    if (!b.proprietaire_email || !b.date_debut_bail) { stats.skipped++; continue }
    // Anniv = même mois/jour que date_debut_bail, année courante
    const dStart = new Date(b.date_debut_bail)
    if (isNaN(dStart.getTime())) { stats.skipped++; continue }
    const anniv = new Date(thisYear, dStart.getMonth(), dStart.getDate())
    // Si l'anniv est passé de plus de 60j cette année, considère anniv année prochaine.
    // Si dans le futur de plus de 60j, considère anniv année dernière (déjà dépassé mais pas indexé).
    let delaiJours = Math.floor((anniv.getTime() - now.getTime()) / (24 * 3600 * 1000))
    if (delaiJours < -60) {
      // L'anniv courant est très passé → considérer l'anniv prochain
      const annivNext = new Date(thisYear + 1, dStart.getMonth(), dStart.getDate())
      delaiJours = Math.floor((annivNext.getTime() - now.getTime()) / (24 * 3600 * 1000))
    }
    // Fenêtre ±30j
    if (delaiJours > 30 || delaiJours < -30) { stats.skipped++; continue }

    // Skip si déjà indexé cette année (irl_derniere_indexation_at >= 1er janvier de l'année courante)
    if (b.irl_derniere_indexation_at) {
      const indexedDate = new Date(b.irl_derniere_indexation_at)
      const yearStart = new Date(thisYear, 0, 1)
      if (indexedDate.getTime() >= yearStart.getTime()) {
        stats.skipped++; continue
      }
    }

    const loyerCC = (Number(b.prix) || 0) + (Number(b.charges) || 0)
    if (loyerCC === 0) { stats.skipped++; continue }

    try {
      const propEmailLc = b.proprietaire_email.toLowerCase()
      // V54.2 — respect notif_preferences (irl_proposition)
      const allowed = await shouldSendEmailForEvent(propEmailLc, "irl_proposition")
      if (!allowed) { stats.skipped++; continue }
      const tpl = irlIndexationProposalTemplate({
        bienTitre: b.titre || "Logement",
        ville: b.ville,
        loyerActuelCC: loyerCC,
        trimestre,
        ctaUrl: `${base}/proprietaire/bail/${b.id}?action=indexer-irl`,
        delaiAnniv: delaiJours,
      })
      const result = await sendEmail({
        to: propEmailLc,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [{ name: "category", value: "irl_indexation_proposal" }, { name: "trimestre", value: trimestre.replace(/\s+/g, "_") }],
      })
      if (result.ok) stats.envoyes++
    } catch (e) {
      console.warn("[cron/irl-rappel-bail] send error for annonce", b.id, e)
      stats.errors++
    }
  }

  return NextResponse.json({ ok: true, stats, ranAt: new Date().toISOString() })
}
