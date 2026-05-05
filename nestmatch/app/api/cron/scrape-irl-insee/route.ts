/**
 * V70.7 — GET /api/cron/scrape-irl-insee
 *
 * Cron monthly (1er du mois 6h Paris). Scrape la page officielle INSEE
 * pour récupérer le dernier IRL publié et le persister dans la table
 * `irl_history`.
 *
 * Source : https://www.insee.fr/fr/statistiques/serie/001515333
 *
 * Stratégie de scrape (best-effort, robuste aux changements HTML) :
 *   1. Fetch la page → parse HTML grossier (regex sur valeur + trimestre)
 *   2. Cherche les patterns classiques INSEE : "T1 2026 : 145,66" ou
 *      tableaux <td>145,66</td><td>T1 2026</td>
 *   3. Si parse OK → INSERT dans irl_history avec ON CONFLICT IGNORE
 *      (idempotent, pas de doublon)
 *   4. Si nouveau trimestre détecté vs précédent en DB → email Paul
 *      "nouvelle indice IRL publiée"
 *   5. Si parse fail → email Paul "scrape INSEE échoué, MAJ manuelle requise"
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * NB : pas d'API INSEE officielle sans clé OAuth → on scrape la page
 * publique. Stable depuis 2010+ mais à vérifier annuellement.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { wrapHandler } from "@/lib/logger"

export const runtime = "nodejs"

const INSEE_URL = "https://www.insee.fr/fr/statistiques/serie/001515333"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tic3467@gmail.com"

interface ScrapedIRL {
  trimestre: string  // "T1 2026"
  annee: number
  trimNum: 1 | 2 | 3 | 4
  indice: number
  publicationDate: string
}

/**
 * Parse une page INSEE et extrait la dernière ligne (= plus récent trimestre).
 * Format attendu (variant) :
 *   - Tableau HTML avec colonnes [Période, Indice, Variation]
 *   - Ligne récente : <td>2026-T1</td><td>145,66</td><td>+1,5</td>
 *
 * Fallback : cherche tous les patterns "T<n> <année>" et "<num>,<num>"
 * proches dans le HTML.
 */
function parseInseeHtml(html: string): ScrapedIRL | null {
  // Pattern 1 : <td>2026-T1</td>...<td>145,66</td>
  // Le séparateur décimal est la virgule en français
  const tdMatcher = /<td[^>]*>\s*(\d{4})-T([1-4])\s*<\/td>[^<]*(?:<[^>]+>[^<]*)*?<td[^>]*>\s*(\d{1,3}[,.]\d{1,3})\s*<\/td>/gi
  const matches: Array<{ annee: number; trimNum: 1|2|3|4; indice: number }> = []
  let m: RegExpExecArray | null
  while ((m = tdMatcher.exec(html)) !== null) {
    const annee = parseInt(m[1], 10)
    const trimNumRaw = parseInt(m[2], 10)
    if (trimNumRaw < 1 || trimNumRaw > 4) continue
    const trimNum = trimNumRaw as 1|2|3|4
    const indice = parseFloat(m[3].replace(",", "."))
    if (Number.isFinite(indice) && Number.isFinite(annee)) {
      matches.push({ annee, trimNum, indice })
    }
  }

  if (matches.length === 0) {
    // Pattern 2 (fallback) : "T1 2026" + "145,66" proches
    const trimText = /T([1-4])[\s ]+(\d{4})/g
    const indiceText = /(\d{3}[,.]\d{2})/g
    const trims: Array<{ trimNum: 1|2|3|4; annee: number; idx: number }> = []
    while ((m = trimText.exec(html)) !== null) {
      const trimNumRaw = parseInt(m[1], 10)
      if (trimNumRaw < 1 || trimNumRaw > 4) continue
      trims.push({ trimNum: trimNumRaw as 1|2|3|4, annee: parseInt(m[2], 10), idx: m.index })
    }
    while ((m = indiceText.exec(html)) !== null) {
      const idx = m.index
      const proche = trims.find(t => Math.abs(t.idx - idx) < 200)
      if (proche) {
        matches.push({ annee: proche.annee, trimNum: proche.trimNum, indice: parseFloat(m[1].replace(",", ".")) })
      }
    }
  }

  if (matches.length === 0) return null

  // Trier par récence (annee desc, trim desc) et prendre le 1ᵉʳ valide
  matches.sort((a, b) => b.annee * 10 + b.trimNum - (a.annee * 10 + a.trimNum))
  const latest = matches[0]
  // Sanity check : indice IRL doit être dans [100, 200] (sinon parsing foireux)
  if (latest.indice < 100 || latest.indice > 200) return null

  const moisPub = ["Avril", "Juillet", "Octobre", "Janvier"][latest.trimNum - 1]
  const anneePub = latest.trimNum === 4 ? latest.annee + 1 : latest.annee
  return {
    trimestre: `T${latest.trimNum} ${latest.annee}`,
    annee: latest.annee,
    trimNum: latest.trimNum,
    indice: latest.indice,
    publicationDate: `${moisPub} ${anneePub}`,
  }
}

export const GET = wrapHandler({ route: "/api/cron/scrape-irl-insee", method: "GET" }, async (req: NextRequest, log) => {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    log.warn("unauthorized")
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // 1. Fetch INSEE page (timeout 10s)
  let html: string
  try {
    const res = await fetch(INSEE_URL, {
      method: "GET",
      headers: { "User-Agent": "KeyMatch-Bot/1.0 (+https://keymatch-immo.fr)" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      log.error("INSEE fetch HTTP failed", { status: res.status })
      return NextResponse.json({ ok: false, error: `INSEE HTTP ${res.status}` }, { status: 502 })
    }
    html = await res.text()
  } catch (e) {
    log.error("INSEE fetch threw", { error: e instanceof Error ? e.message : String(e) })
    // Email admin "scrape échoué"
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: "🚨 KeyMatch — Scrape INSEE IRL échoué",
        html: `<p>Le cron <code>scrape-irl-insee</code> n'a pas pu fetch INSEE.</p><p>Erreur : <code>${e instanceof Error ? e.message : String(e)}</code></p><p>Vérifier : ${INSEE_URL}</p>`,
        text: `Scrape INSEE IRL échoué.\nErreur : ${e instanceof Error ? e.message : String(e)}\nVérifier : ${INSEE_URL}`,
        tags: [{ name: "type", value: "irl_scrape_alert" }],
      })
    } catch { /* silent */ }
    return NextResponse.json({ ok: false, error: "INSEE fetch failed" }, { status: 502 })
  }

  // 2. Parse HTML
  const parsed = parseInseeHtml(html)
  if (!parsed) {
    log.error("INSEE parse failed (HTML structure changed?)", { htmlLength: html.length })
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: "🚨 KeyMatch — Parse INSEE IRL échoué",
        html: `<p>Le cron <code>scrape-irl-insee</code> a fetch la page mais n'a pas pu parser l'IRL.</p><p>La structure HTML INSEE a probablement changé. MAJ manuelle requise dans <code>lib/irl.ts</code> + adaptation des regex dans <code>app/api/cron/scrape-irl-insee/route.ts</code>.</p><p>Source : ${INSEE_URL}</p>`,
        text: `Parse INSEE IRL échoué. Structure HTML changée. MAJ manuelle requise.\nSource : ${INSEE_URL}`,
        tags: [{ name: "type", value: "irl_scrape_alert" }],
      })
    } catch { /* silent */ }
    return NextResponse.json({ ok: false, error: "INSEE parse failed" }, { status: 500 })
  }

  log.info("parsed IRL", { trimestre: parsed.trimestre, indice: parsed.indice })

  // 3. Check si déjà en DB (idempotent)
  const { data: existing } = await supabaseAdmin
    .from("irl_history")
    .select("trimestre, indice, scrapped_at")
    .eq("trimestre", parsed.trimestre)
    .maybeSingle()

  if (existing) {
    log.info("trimestre already in DB, skip insert", { trimestre: parsed.trimestre })
    return NextResponse.json({ ok: true, alreadyExists: true, trimestre: parsed.trimestre })
  }

  // 4. Insert nouveau trimestre
  const now = new Date().toISOString()
  const { error: insErr } = await supabaseAdmin
    .from("irl_history")
    .insert({
      trimestre: parsed.trimestre,
      annee: parsed.annee,
      trim_num: parsed.trimNum,
      indice: parsed.indice,
      publication_date: parsed.publicationDate,
      scrapped_at: now,
    })

  if (insErr) {
    log.error("insert irl_history failed", { error: insErr.message })
    return NextResponse.json({ ok: false, error: "Insert échoué" }, { status: 500 })
  }

  log.info("new IRL inserted", { ...parsed })

  // 5. Email Paul "nouvelle indice IRL publiée"
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `📈 KeyMatch — Nouvel IRL publié : ${parsed.trimestre} = ${parsed.indice}`,
      html: `<p>L'INSEE a publié l'IRL pour <strong>${parsed.trimestre}</strong> :</p><ul><li>Indice : <strong>${parsed.indice}</strong></li><li>Publication : ${parsed.publicationDate}</li></ul><p>L'entrée a été ajoutée à <code>irl_history</code>. Pensez aussi à mettre à jour <code>lib/irl.ts IRL_HISTORIQUE</code> au prochain commit pour le fallback hardcodé.</p>`,
      text: `Nouvel IRL : ${parsed.trimestre} = ${parsed.indice}\nPublication : ${parsed.publicationDate}\nEntrée ajoutée à irl_history. Pensez à MAJ lib/irl.ts.`,
      tags: [{ name: "type", value: "irl_new" }],
    })
  } catch (e) {
    log.warn("admin email failed", { error: e instanceof Error ? e.message : String(e) })
  }

  return NextResponse.json({ ok: true, inserted: true, ...parsed })
})
