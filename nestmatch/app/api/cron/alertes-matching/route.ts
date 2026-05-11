/**
 * V97.13 P3-2.B — GET /api/cron/alertes-matching
 *
 * Cron quotidien (Vercel : 09:30 UTC ≈ 10:30/11:30 Paris).
 *
 * Logique :
 *  1. SELECT profils où notif_preferences.nouvelle_annonce_match = true
 *     ET derniere_alerte_envoyee_at est NULL OU < now() - 22h
 *     (22h = marge anti-jitter vs cron exactement 24h).
 *  2. SELECT annonces créées depuis 7 jours (fenêtre cap pour ne pas spam
 *     les nouveaux inscrits avec 200 annonces du dernier mois).
 *  3. Pour chaque profil, score chaque annonce via calculerScore(),
 *     garde score >= 600 (60% match), top 5 par score.
 *  4. Si ≥1 match, envoyer nouvellesAnnoncesMatchTemplate via Resend.
 *  5. UPDATE derniere_alerte_envoyee_at = now() pour ce profil.
 *
 * Anti-spam :
 *  - max 1 email / 24h / profil (derniere_alerte_envoyee_at filtering)
 *  - 5 annonces max dans l'email (UI lisible)
 *  - score >= 600 (sinon spam de matches faibles)
 *  - respecte shouldSendEmailForEvent (double check côté server)
 *
 * Idempotence :
 *  - Si le cron tourne 2× dans la fenêtre 22h, le 2e run skip tous les
 *    profils (derniere_alerte_envoyee_at est récent).
 *  - Si Resend down, on update QUAND MÊME derniere_alerte_envoyee_at
 *    pour éviter de boucler en réessayant. L'user manquera 1 jour
 *    d'alerte mais reverra ses matches le lendemain.
 *
 * Auth : Bearer CRON_SECRET en prod (cf process.env.CRON_SECRET).
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { nouvellesAnnoncesMatchTemplate } from "@/lib/email/templates"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"
import { calculerScore, type Annonce as MatchAnnonce, type Profil as MatchProfil } from "@/lib/matching"

interface ProfilRow {
  email: string
  prenom: string | null
  nom: string | null
  notif_preferences: Record<string, unknown> | null
  derniere_alerte_envoyee_at: string | null
  is_proprietaire: boolean | null
  seuil_match_pct: number | null  // V97.15 P3-2.C — défaut 60 si NULL
  // Critères matching (sous-ensemble de MatchProfil)
  ville_souhaitee: string | null
  budget_min: number | null
  budget_max: number | null
  surface_min: number | null
  surface_max: number | null
  pieces_min: number | null
  meuble: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface AnnonceRow {
  id: number
  titre: string
  ville: string | null
  prix: number | null
  charges: number | null
  surface: number | null
  pieces: number | null
  meuble: boolean | null
  created_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

const DEFAULT_SEUIL_PCT = 60     // V97.15 — fallback si profil.seuil_match_pct NULL
const MAX_PER_EMAIL = 5          // garde l'email court
const ANNONCES_WINDOW_DAYS = 7
const MIN_HOURS_BETWEEN_EMAILS = 22

export const GET = withCronLogging("alertes-matching", "30 9 * * *", async function cronGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // 1. Profils opt-in qui n'ont pas reçu d'alerte dans les 22 dernières heures.
  // V97.13 fix B2 — filtre côté SQL via path jsonb pour ne pas transférer
  // tous les profils. V97.15 — default true sur la pref, donc on récupère
  // ceux qui n'ont PAS désactivé (clé absente OU true).
  const cutoff = new Date(Date.now() - MIN_HOURS_BETWEEN_EMAILS * 3600 * 1000).toISOString()
  const { data: allProfils, error: profilsErr } = await supabaseAdmin
    .from("profils")
    .select("*")
  if (profilsErr) {
    console.error("[cron/alertes-matching] profils fetch error:", profilsErr)
    return NextResponse.json({ ok: false, error: "DB error profils" }, { status: 500 })
  }
  const profils = (allProfils || []) as ProfilRow[]

  // V97.15 P3-2.C — Précharge la liste des emails qui sont locataires actifs
  // (au moins un bail en cours signé). Ces users ont déjà trouvé un logement
  // et n'ont pas besoin d'alertes de recherche.
  const { data: locatairesActifs, error: errLoc } = await supabaseAdmin
    .from("annonces")
    .select("locataire_email")
    .not("locataire_email", "is", null)
    .not("bail_signe_locataire_at", "is", null)
  if (errLoc) {
    // V97.15 fix B5 verifier — pas de silent failure. Si on n'a pas la liste
    // des locataires actifs, on RISQUE de leur envoyer des emails (promesse
    // violée). Mieux vaut bail-out tout le cron qu'envoyer de mauvais emails.
    console.error("[cron/alertes-matching] locatairesActifs fetch error:", errLoc)
    return NextResponse.json({ ok: false, error: "DB error locataires" }, { status: 500 })
  }
  const locatairesActifsSet = new Set(
    (locatairesActifs || [])
      .map(a => (a.locataire_email || "").toLowerCase())
      .filter(Boolean),
  )

  // V97.15 P3-2.C — Précharge la liste des emails proprios (ont publié ≥1 annonce).
  // Évite d'envoyer des alertes locataire à un proprio.
  const { data: proprios, error: errProp } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email")
    .not("proprietaire_email", "is", null)
  if (errProp) {
    console.error("[cron/alertes-matching] proprios fetch error:", errProp)
    return NextResponse.json({ ok: false, error: "DB error proprios" }, { status: 500 })
  }
  const propriosSet = new Set(
    (proprios || [])
      .map(a => (a.proprietaire_email || "").toLowerCase())
      .filter(Boolean),
  )

  // Filtre 22h + opt-in + pas proprio + pas locataire actif
  const eligibles = profils.filter(p => {
    const prefs = p.notif_preferences || {}
    // V97.15 — default true : on respecte une désactivation explicite
    // (clé === false). Toute autre valeur (true, undefined, null) = ON.
    if (prefs.nouvelle_annonce_match === false) return false

    // Skip proprios (flag is_proprietaire ET/OU présence dans annonces.proprietaire_email)
    if (p.is_proprietaire === true) return false
    if (propriosSet.has(p.email.toLowerCase())) return false

    // Skip locataires déjà casés (bail actif signé)
    if (locatairesActifsSet.has(p.email.toLowerCase())) return false

    // Skip si alerte récente
    if (p.derniere_alerte_envoyee_at && p.derniere_alerte_envoyee_at >= cutoff) return false

    return true
  })

  if (eligibles.length === 0) {
    return NextResponse.json({ ok: true, stats: { eligibles: 0, emails_envoyes: 0 } })
  }

  // 2. Annonces créées dans la fenêtre 7j (uniquement dispo + non-test)
  const since = new Date(Date.now() - ANNONCES_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: annonces, error: annoncesErr } = await supabaseAdmin
    .from("annonces")
    .select("*")
    .gte("created_at", since)
    .eq("is_test", false)
    .or("statut.is.null,statut.eq.disponible")
    .order("created_at", { ascending: false })
    .limit(500)
  if (annoncesErr) {
    console.error("[cron/alertes-matching] annonces fetch error:", annoncesErr)
    return NextResponse.json({ ok: false, error: "DB error annonces" }, { status: 500 })
  }
  const annoncesArr = (annonces || []) as AnnonceRow[]

  if (annoncesArr.length === 0) {
    return NextResponse.json({ ok: true, stats: { eligibles: eligibles.length, annonces_disponibles: 0, emails_envoyes: 0 } })
  }

  // 3. Pour chaque profil, score les annonces et garde top N >= MIN_SCORE
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  let emailsEnvoyes = 0
  let emailsSkippes = 0
  let emailsErreurs = 0

  for (const p of eligibles) {
    // Filtre les annonces créées DEPUIS la dernière alerte (ou 7j si jamais)
    const profilSince = p.derniere_alerte_envoyee_at && p.derniere_alerte_envoyee_at > since
      ? p.derniere_alerte_envoyee_at
      : since
    const annoncesNouvelles = annoncesArr.filter(a => a.created_at >= profilSince)
    if (annoncesNouvelles.length === 0) continue

    // V97.15 P3-2.C — Seuil custom par profil (default 60% si NULL/missing).
    // Range DB-checked 30-95 mais on clamp côté code par sécurité.
    const seuilPct = Math.max(30, Math.min(95, p.seuil_match_pct ?? DEFAULT_SEUIL_PCT))
    const seuilScore = seuilPct * 10  // score est /1000

    // Score chaque annonce. V97.13 fix B1 — try/catch par annonce pour éviter
    // qu'une annonce malformée (NaN, données invalides) ne crash tout le batch
    // et empêche TOUS les profils restants de recevoir leur email du jour.
    const scored = annoncesNouvelles
      .map(a => {
        try {
          return { a, score: calculerScore(a as unknown as MatchAnnonce, p as unknown as MatchProfil) }
        } catch (e) {
          console.warn("[cron/alertes-matching] calculerScore failed annonce_id=", a.id, e instanceof Error ? e.message : String(e))
          return { a, score: 0 }
        }
      })
      .filter(x => x.score >= seuilScore)  // V97.15 — seuil custom
      .sort((x, y) => y.score - x.score)

    if (scored.length === 0) continue

    // V54 — respect notif_preferences (double check côté server au cas où
    // l'user a désactivé entre le SELECT et le moment du send)
    const allowed = await shouldSendEmailForEvent(p.email, "nouvelle_annonce_match")
    if (!allowed) {
      emailsSkippes += 1
      continue
    }

    // Envoi email
    const locataireName = [p.prenom, p.nom].filter(Boolean).join(" ") || ""
    const { subject, html, text } = nouvellesAnnoncesMatchTemplate({
      locataireName,
      annonces: scored.slice(0, MAX_PER_EMAIL).map(x => ({
        id: x.a.id,
        titre: x.a.titre,
        ville: x.a.ville,
        prix: x.a.prix,
        charges: x.a.charges,
        surface: x.a.surface,
        pieces: x.a.pieces,
        score: x.score,
        href: `${base}/annonces/${x.a.id}`,
      })),
      rechercheUrl: `${base}/annonces`,
      parametresUrl: `${base}/parametres?tab=compte`,
    })

    const sendRes = await sendEmail({
      to: p.email,
      subject,
      html,
      text,
      templateName: "nouvelle_annonce_match",
      tags: [{ name: "type", value: "alerte_matching" }],
    })

    if (sendRes.ok === true) {
      emailsEnvoyes += 1
    } else {
      // Type narrow : sendRes is { ok: false; error: string; skipped?: boolean }
      const failed = sendRes as { ok: false; error: string; skipped?: boolean }
      if (failed.skipped) {
        emailsSkippes += 1
      } else {
        emailsErreurs += 1
        console.warn("[cron/alertes-matching] send failed for", p.email, failed.error)
      }
    }

    // 4. UPDATE derniere_alerte_envoyee_at — même si l'envoi a échoué, pour
    //    éviter de retomber dessus toutes les heures. L'user re-recevra
    //    demain si Resend revient.
    const now = new Date().toISOString()
    await supabaseAdmin
      .from("profils")
      .update({ derniere_alerte_envoyee_at: now })
      .eq("email", p.email)
  }

  return NextResponse.json({
    ok: true,
    stats: {
      eligibles: eligibles.length,
      annonces_disponibles: annoncesArr.length,
      emails_envoyes: emailsEnvoyes,
      emails_skippes: emailsSkippes,
      emails_erreurs: emailsErreurs,
    },
  })
})
