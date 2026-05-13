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
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { importFromUrl, ImportError } from "@/lib/import"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Vercel default 10s — on monte à 15s car fetch externe lent possible
export const maxDuration = 15

interface Body {
  url?: string
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

  // Rate-limit : 10 imports / heure / user, fallback IP si pas d'user
  const key = `import:${me}`
  const rl = await checkRateLimitAsync(key, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    // Rate-limit secondaire par IP pour éviter qu'un user crée 50 comptes
    const ip = getClientIp(req.headers)
    const rlIp = await checkRateLimitAsync(`import:ip:${ip}`, { max: 30, windowMs: 60 * 60 * 1000 })
    if (!rlIp.allowed) {
      return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "Trop d'imports — réessayez dans 1h." }, { status: 429 })
    }
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "Trop d'imports — réessayez dans 1h." }, { status: 429 })
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

  try {
    const result = await importFromUrl(url)

    void logImport({
      user_email: me,
      source: result.data.source,
      source_url: result.data.source_url,
      status: result.fields_extracted >= 3 ? "success" : "partial",
      fields_extracted: result.fields_extracted,
      fields_total: result.fields_total,
      duration_ms: result.duration_ms,
    })

    return NextResponse.json({
      ok: true,
      data: result.data,
      fields_extracted: result.fields_extracted,
      fields_total: result.fields_total,
      duration_ms: result.duration_ms,
      source: result.data.source,
    })
  } catch (e) {
    const code = e instanceof ImportError ? e.code : "UNKNOWN_ERROR"
    const message = e instanceof Error ? e.message : "Erreur inconnue"

    void logImport({
      user_email: me,
      source: null,
      source_url: url,
      status: "fail",
      error_code: code,
      error_message: message.slice(0, 500),
    })

    // Statut HTTP selon le code
    const status = code === "TIMEOUT" ? 504
      : code === "RATE_LIMITED" ? 429
      : code === "INVALID_URL" || code === "UNSUPPORTED_PROTOCOL" || code === "BLOCKED_HOST" || code === "PRIVATE_IP" ? 400
      : code === "TOO_LARGE" ? 413
      : code === "HTTP_ERROR" ? 502
      : 400

    return NextResponse.json({ ok: false, code, error: message }, { status })
  }
}
