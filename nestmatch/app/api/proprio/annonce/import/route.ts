/**
 * V97.36 P3-7 — POST /api/proprio/annonce/import
 *
 * Importe une annonce depuis une URL externe (Leboncoin, SeLoger, PAP,
 * Bien'ici, Logic-immo ou générique). Le proprio colle son lien, on
 * fetch + parse + retourne les données extraites pour pré-remplir le
 * wizard /proprietaire/ajouter.
 *
 * Body :
 *   { url: string }
 *
 * Réponse OK :
 *   {
 *     ok: true,
 *     data: ImportedAnnonce,
 *     fields_extracted: 14,
 *     fields_total: 20,
 *     duration_ms: 850,
 *     source: "leboncoin"
 *   }
 *
 * Réponse erreur :
 *   { ok: false, code: "INVALID_URL", error: "URL invalide" }
 *
 * Auth : session NextAuth requise.
 * Rate-limit : 10 imports / heure / user (anti-abus + sanity).
 * Logs : INSERT dans `import_logs` à chaque appel (success ou fail) pour
 * monitoring admin → si un parser dégrade en prod (site source change son
 * markup), on voit le taux de fail monter.
 *
 * Aspect légal : feature uniquement déclenchée par le proprio qui colle
 * SON lien (= consentement implicite à réutiliser ses propres données).
 * Pas de scraping en masse, pas d'indexation, pas d'usage commercial du
 * contenu tiers. UA explicite + lien aide.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import * as Sentry from "@sentry/nextjs"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { importFromUrl, importFromHtml, ImportError } from "@/lib/import"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// V97.39 — Vercel Pro autorise maxDuration jusqu'à 60s. Le worker Zendriver
// prend 5-15s pour résoudre DataDome, donc on monte à 30s pour sécurité.
// Pour les hosts non-DataDome (PAP, agences, generic), le fetcher local
// répond toujours en <8s, le 30s ne coûte rien.
export const maxDuration = 30

interface Body {
  url?: string
  html?: string  // V97.39.17 — payload bookmarklet : HTML déjà rendu côté navigateur user
}

async function logImport(params: {
  user_email: string | null
  source: string | null
  source_url: string
  status: "success" | "fail" | "partial"
  fields_extracted?: number
  fields_total?: number
  duration_ms?: number
  error_code?: string
  error_message?: string
  fetcher_used?: string | null
}) {
  try {
    await supabaseAdmin.from("import_logs").insert(params)
  } catch (e) {
    console.warn("[import-logs] insert failed:", e)
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase() || null
  if (!me) {
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED", error: "Connexion requise" }, { status: 401 })
  }

  // Rate-limit : 10 imports / heure / user. Anti-burst secondaire par IP
  // pour limiter qu'un attaquant crée plusieurs comptes et amplifie.
  // Les 2 limites sont ET-liées : il faut être en-dessous des deux.
  const rlUser = await checkRateLimitAsync(`import:${me}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rlUser.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Trop d'imports — réessayez dans 1h." },
      { status: 429 },
    )
  }
  const ip = getClientIp(req.headers)
  const rlIp = await checkRateLimitAsync(`import:ip:${ip}`, { max: 30, windowMs: 60 * 60 * 1000 })
  if (!rlIp.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: "Trop d'imports depuis cette IP." },
      { status: 429 },
    )
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, code: "BAD_JSON", error: "JSON invalide" }, { status: 400 })
  }

  const url = typeof body.url === "string" ? body.url.trim() : ""
  if (!url) {
    return NextResponse.json({ ok: false, code: "MISSING_URL", error: "URL requise" }, { status: 400 })
  }
  if (url.length > 2000) {
    return NextResponse.json({ ok: false, code: "URL_TOO_LONG", error: "URL trop longue" }, { status: 400 })
  }

  // V97.39.17 — Si payload bookmarklet inclut html → parse direct, skip fetcher
  const htmlPayload = typeof body.html === "string" ? body.html : null

  try {
    const result = htmlPayload
      ? await importFromHtml(url, htmlPayload)
      : await importFromUrl(url)

    await logImport({
      user_email: me,
      source: result.data.source,
      source_url: result.data.source_url,
      status: result.fields_extracted >= 3 ? "success" : "partial",
      fields_extracted: result.fields_extracted,
      fields_total: result.fields_total,
      duration_ms: result.duration_ms,
      fetcher_used: result.fetcher_used,
    })

    return NextResponse.json({
      ok: true,
      data: result.data,
      fields_extracted: result.fields_extracted,
      fields_total: result.fields_total,
      duration_ms: result.duration_ms,
      source: result.data.source,
      fetcher_used: result.fetcher_used,
    })
  } catch (e) {
    const code = e instanceof ImportError ? e.code : "UNKNOWN_ERROR"
    const message = e instanceof Error ? e.message : "Erreur inconnue"

    await logImport({
      user_email: me,
      source: null,
      source_url: url,
      status: "fail",
      error_code: code,
      error_message: message.slice(0, 500),
    })

    // V97.39.7 — Sentry breadcrumb pour visibilité prod. On capture comme
    // exception SEULEMENT les vraies erreurs serveur (UNKNOWN_ERROR, PARSE_ERROR,
    // WORKER_UNAVAILABLE) — pas les codes "comportementaux" (BOT_PROTECTION,
    // NOT_FOUND, RATE_LIMITED) qui sont attendus côté business.
    try {
      const hostFromUrl = (() => { try { return new URL(url).hostname } catch { return null } })()
      Sentry.addBreadcrumb({
        category: "import-annonce",
        level: "warning",
        message: `Import failed: ${code}`,
        data: { url_host: hostFromUrl, code },
      })
      const SHOULD_CAPTURE = ["UNKNOWN_ERROR", "PARSE_ERROR", "WORKER_UNAVAILABLE", "FETCH_ERROR"]
      if (SHOULD_CAPTURE.includes(code)) {
        Sentry.captureException(e instanceof Error ? e : new Error(message), {
          tags: { feature: "import-annonce", import_code: code },
          extra: { url_host: hostFromUrl, user_email: me },
        })
      }
    } catch { /* ne casse pas l'API si Sentry foire */ }

    // Statut HTTP selon le code (V97.39 ajoute les codes worker, V97.39.17 codes bookmarklet)
    const status = code === "TIMEOUT" || code === "WORKER_TIMEOUT" ? 504
      : code === "RATE_LIMITED" ? 429
      : code === "INVALID_URL" || code === "UNSUPPORTED_PROTOCOL" || code === "BLOCKED_HOST" || code === "PRIVATE_IP" ? 400
      : code === "TOO_LARGE" || code === "HTML_TOO_LARGE" ? 413
      : code === "HTML_TOO_SHORT" ? 400
      : code === "HTTP_ERROR" ? 502
      : code === "WORKER_UNAVAILABLE" || code === "WORKER_NOT_CONFIGURED" ? 503
      : code === "BOT_PROTECTION" ? 502
      : 400

    return NextResponse.json({ ok: false, code, error: message }, { status })
  }
}
