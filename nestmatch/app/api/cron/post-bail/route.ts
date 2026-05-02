/**
 * V57.4 + V57.7 — GET /api/cron/post-bail
 *
 * Cron quotidien qui gère 3 events post-bail :
 *
 * 1. EMAIL MERCI LOCATAIRE + EMAIL CLOS PROPRIO (V57.4)
 *    Pour chaque historique_baux dont bail_termine_at = J-1 (envoi 1 jour
 *    après l'archivage du bail, laisse le temps de la dernière notif EDL),
 *    envoie 2 emails :
 *    - Locataire : merci + 5 annonces similaires si profil actif
 *    - Proprio : bail clos + bouton republier 1-click
 *    Anti-spam : `historique_baux.email_post_bail_envoye_at` (NEW colonne).
 *
 * 2. WARNING PROPRIO DÉLAI DÉPÔT APPROCHE (V57.7)
 *    Pour chaque annonce avec bail_termine_at + caution > 0 +
 *    depot_restitue_at IS NULL :
 *    - À J+25 (5j avant délai 30j si pas retenue) → warning
 *    - À J+50 (10j avant délai 60j si retenue) → warning
 *
 * 3. CONTENTIEUX DÉPÔT NON RESTITUÉ (V57.7)
 *    Pour chaque annonce avec délai dépassé (J+30 ou J+60 selon retenue) :
 *    - Email locataire avec procédure ADIL + recours
 *    - Anti-spam : annonce.contentieux_email_envoye_at (NEW colonne)
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * Note : la colonne historique_baux.email_post_bail_envoye_at + annonce.
 * contentieux_email_envoye_at sont à ajouter dans une migration de suite
 * (055). En attendant, on fallback sur fenêtre temporelle pour éviter
 * spam sur même run.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import {
  bailMerciLocataireTemplate,
  bailClosProprioTemplate,
  depotContentieuxLocataireTemplate,
  depotWarningProprioTemplate,
} from "@/lib/email/templates"
import { calculerScore, type Profil as MatchingProfil, type Annonce as MatchingAnnonce } from "@/lib/matching"

interface AnnonceFinBail {
  id: number
  titre: string | null
  ville: string | null
  proprietaire_email: string | null
  locataire_email_at_end: string | null
  bail_termine_at: string | null
  caution: number | null
  depot_restitue_at: string | null
  contentieux_email_envoye_at?: string | null
  warning_depot_envoye_at?: string | null
}

interface HistoriqueBail {
  id: number
  annonce_id: number
  proprietaire_email: string
  locataire_email: string
  date_debut_bail: string | null
  date_fin_bail: string | null
  bail_termine_at: string
  bien_titre: string | null
  bien_ville: string | null
  total_loyers_percus: number | null
  email_post_bail_envoye_at?: string | null
}

const ADIL_URL = "https://www.anil.org/aides-locatives/depot-de-garantie/"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  const stats = {
    merci_emails: 0,
    clos_emails: 0,
    warning_emails: 0,
    contentieux_emails: 0,
    skipped: 0,
    errors: 0,
  }

  // ─── 1. Emails merci/clos (V57.4) ────────────────────────────────────────
  // Cible : historique_baux où bail_termine_at est dans [now-2j, now-1j].
  // Fenêtre 24h pour absorber les retards de cron (1 daily run par jour).
  const ts2dAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString()
  const ts1dAgo = new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString()
  const { data: histos } = await supabaseAdmin
    .from("historique_baux")
    .select("id, annonce_id, proprietaire_email, locataire_email, date_debut_bail, date_fin_bail, bail_termine_at, bien_titre, bien_ville, total_loyers_percus, email_post_bail_envoye_at")
    .gte("bail_termine_at", ts2dAgo)
    .lte("bail_termine_at", ts1dAgo)
  for (const h of (histos || []) as HistoriqueBail[]) {
    if (h.email_post_bail_envoye_at) { stats.skipped++; continue }
    const dureeMois = (() => {
      if (!h.date_debut_bail || !h.date_fin_bail) return 1
      const start = new Date(h.date_debut_bail).getTime()
      const end = new Date(h.date_fin_bail).getTime()
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 1
      return Math.max(1, Math.round((end - start) / (30 * 24 * 3600 * 1000)))
    })()
    // Email locataire avec recos
    try {
      // Charge profil locataire pour matching
      const { data: locProf } = await supabaseAdmin
        .from("profils")
        .select("budget_min, budget_max, surface_min, surface_max, pieces_min, ville_souhaitee, animaux, fumeur, garant, type_garant, mode_localisation, type_bail, meuble, parking, balcon, terrasse, jardin, cave, fibre, ascenseur, dpe_min, dpe_min_actif, tolerance_budget_pct")
        .eq("email", h.locataire_email)
        .maybeSingle()
      let recommandations: Array<{ id: number; titre: string; ville: string | null; prix: number | null; href: string }> = []
      if (locProf?.ville_souhaitee && locProf?.budget_max) {
        const { data: matches } = await supabaseAdmin
          .from("annonces")
          .select("id, titre, ville, prix, charges, surface, pieces, meuble, dpe, equipements, parking, balcon, terrasse, jardin, cave, fibre, ascenseur, animaux")
          .eq("statut", "disponible")
          .eq("ville", locProf.ville_souhaitee)
          .lte("prix", Math.round((locProf.budget_max as number) * 1.1))
          .limit(10)
        recommandations = (matches || [])
          .map(a => {
            try {
              const score = calculerScore(locProf as unknown as MatchingProfil, a as unknown as MatchingAnnonce)
              return { ...a, _score: score }
            } catch { return { ...a, _score: 0 } }
          })
          .sort((a, b) => (b._score || 0) - (a._score || 0))
          .slice(0, 5)
          .map(a => ({
            id: a.id,
            titre: a.titre || "Logement",
            ville: a.ville || null,
            prix: typeof a.prix === "number" ? a.prix : null,
            href: `${base}/annonces/${a.id}`,
          }))
      }
      const tplLoc = bailMerciLocataireTemplate({
        bienTitre: h.bien_titre || "Logement",
        ville: h.bien_ville,
        dureeMois,
        recommandations,
        searchUrl: `${base}/annonces`,
      })
      await sendEmail({
        to: h.locataire_email,
        subject: tplLoc.subject,
        html: tplLoc.html,
        text: tplLoc.text,
        tags: [{ name: "category", value: "bail_merci_locataire" }],
      })
      stats.merci_emails++
    } catch (e) {
      console.warn("[cron/post-bail] merci email failed for", h.id, e)
      stats.errors++
    }
    // Email proprio + CTA republier
    try {
      const tplProp = bailClosProprioTemplate({
        bienTitre: h.bien_titre || "Logement",
        ville: h.bien_ville,
        dureeMois,
        totalLoyersPercus: Number(h.total_loyers_percus || 0),
        republierUrl: `${base}/proprietaire?republier=${h.annonce_id}`,
      })
      await sendEmail({
        to: h.proprietaire_email,
        subject: tplProp.subject,
        html: tplProp.html,
        text: tplProp.text,
        tags: [{ name: "category", value: "bail_clos_proprio" }],
      })
      stats.clos_emails++
    } catch (e) {
      console.warn("[cron/post-bail] clos email failed for", h.id, e)
      stats.errors++
    }
    // Mark as sent
    await supabaseAdmin
      .from("historique_baux")
      .update({ email_post_bail_envoye_at: new Date().toISOString() })
      .eq("id", h.id)
  }

  // ─── 2 + 3. Warning + contentieux dépôt (V57.7) ─────────────────────────
  // Cible : annonces avec bail_termine_at NOT NULL + caution > 0 +
  // depot_restitue_at IS NULL.
  // On considère délai 60j (avec retenue) par défaut car la retenue est
  // tracking à la restitution. Avant restitution = 60j conservateur.
  const { data: anns } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email_at_end, bail_termine_at, caution, depot_restitue_at, contentieux_email_envoye_at, warning_depot_envoye_at")
    .not("bail_termine_at", "is", null)
    .is("depot_restitue_at", null)
    .gt("caution", 0)
    .lte("bail_termine_at", new Date(now.getTime() - 25 * 24 * 3600 * 1000).toISOString())
  for (const a of (anns || []) as AnnonceFinBail[]) {
    if (!a.bail_termine_at || !a.locataire_email_at_end || !a.proprietaire_email) { stats.skipped++; continue }
    const joursDepuisFin = Math.floor((now.getTime() - new Date(a.bail_termine_at).getTime()) / (24 * 3600 * 1000))
    const caution = Number(a.caution || 0)
    if (caution <= 0) { stats.skipped++; continue }

    // Délai légal : 60j conservateur (la retenue n'est connue qu'à la restitution).
    const delaiLegalJours: 30 | 60 = 60

    // 2. Warning proprio à J+50 (10j avant deadline) — 1 fois max
    if (joursDepuisFin >= 50 && joursDepuisFin < delaiLegalJours && !a.warning_depot_envoye_at) {
      try {
        const joursRestants = delaiLegalJours - joursDepuisFin
        const tpl = depotWarningProprioTemplate({
          bienTitre: a.titre || "Logement",
          ville: a.ville,
          caution,
          joursDepuisFin,
          delaiLegalJours,
          joursRestants,
          restituerUrl: `${base}/proprietaire?restituer=${a.id}`,
        })
        await sendEmail({
          to: a.proprietaire_email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tags: [{ name: "category", value: "depot_warning_proprio" }],
        })
        await supabaseAdmin
          .from("annonces")
          .update({ warning_depot_envoye_at: new Date().toISOString() })
          .eq("id", a.id)
        stats.warning_emails++
      } catch (e) {
        console.warn("[cron/post-bail] warning failed for", a.id, e)
        stats.errors++
      }
    }

    // 3. Contentieux locataire à J+60+ — 1 fois max
    if (joursDepuisFin >= delaiLegalJours && !a.contentieux_email_envoye_at) {
      try {
        const tpl = depotContentieuxLocataireTemplate({
          bienTitre: a.titre || "Logement",
          ville: a.ville,
          caution,
          joursDepuisFin,
          delaiLegalMois: 2,
          contactProprioUrl: `${base}/messages?with=${encodeURIComponent(a.proprietaire_email)}&annonce=${a.id}`,
          procedureAdilUrl: ADIL_URL,
        })
        await sendEmail({
          to: a.locataire_email_at_end,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tags: [{ name: "category", value: "depot_contentieux_locataire" }],
        })
        await supabaseAdmin
          .from("annonces")
          .update({ contentieux_email_envoye_at: new Date().toISOString() })
          .eq("id", a.id)
        stats.contentieux_emails++
      } catch (e) {
        console.warn("[cron/post-bail] contentieux failed for", a.id, e)
        stats.errors++
      }
    }
  }

  return NextResponse.json({ ok: true, stats, ranAt: now.toISOString() })
}
