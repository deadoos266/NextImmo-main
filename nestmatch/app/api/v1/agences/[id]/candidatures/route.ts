/**
 * V97.39.34 — GET /v1/agences/[id]/candidatures
 *
 * Liste les candidatures reçues sur les annonces de l'agence. Permet à un
 * logiciel métier de poll régulièrement et remonter dans son CRM agence.
 *
 * Auth : API key avec scope candidatures:read.
 *
 * Query params :
 *   ?since=ISO_DATE        → ne retourne que les candidatures créées après cette date
 *   ?annonce_id=N          → filtre sur une annonce spécifique
 *   ?limit=50              → pagination
 *   ?offset=0              → pagination
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { verifyApiKey, hasScope, logApiUsage, extractApiKey } from "@/lib/agences/api-keys"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
// (merged with rateLimit)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t0 = performance.now()
  const { id } = await ctx.params
  const ip = getClientIp(req.headers)
  const userAgent = req.headers.get("user-agent") || undefined

  const presented = extractApiKey(req)
  if (!presented) return jsonError(401, "API key missing", "AUTH_MISSING")
  const key = await verifyApiKey(presented)
  if (!key) return jsonError(401, "API key invalide", "AUTH_INVALID")
  if (key.agence_id !== id) return jsonError(403, "Wrong agence", "AUTH_WRONG_AGENCE")
  if (!hasScope(key, "candidatures:read")) {
    return jsonError(403, "Scope candidatures:read requis", "SCOPE")
  }

  const rl = await checkRateLimitAsync(`api-key:${key.id}`, { max: 100, windowMs: 60 * 1000 })
  if (!rl.allowed) {
    return new NextResponse(JSON.stringify({ ok: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec ?? 60) },
    })
  }

  const url = new URL(req.url)
  const since = url.searchParams.get("since")
  const annonceFilter = url.searchParams.get("annonce_id")
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200)
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0)

  // 1. Récupère les IDs d'annonces de cette agence (limite ~1000 OK)
  const { data: annoncesIds } = await supabaseAdmin
    .from("annonces")
    .select("id")
    .eq("agence_id", id)
    .limit(1000)

  const ids = (annoncesIds || []).map(a => a.id)
  if (ids.length === 0) {
    await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint: "GET /v1/agences/:id/candidatures", statusCode: 200, ip, userAgent, durationMs: Math.round(performance.now() - t0) })
    return NextResponse.json({ ok: true, total: 0, limit, offset, candidatures: [] })
  }

  // 2. Fetch les visites (proxy candidatures pour MVP — KeyMatch n'a pas de
  //    table dédiée "candidatures" pour les agences, mais visites + messages
  //    candidatures sur ces annonces)
  let query = supabaseAdmin
    .from("visites")
    .select("id, annonce_id, locataire_email, proprietaire_email, statut, propose_par, date_proposee, message, created_at", { count: "exact" })
    .in("annonce_id", ids)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (since) query = query.gte("created_at", since)
  if (annonceFilter) query = query.eq("annonce_id", parseInt(annonceFilter, 10))

  const { data, error, count } = await query

  if (error) {
    await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint: "GET /v1/agences/:id/candidatures", statusCode: 500, ip, userAgent, durationMs: Math.round(performance.now() - t0), error: error.message })
    return jsonError(500, error.message, "DB_ERROR")
  }

  await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint: "GET /v1/agences/:id/candidatures", statusCode: 200, ip, userAgent, durationMs: Math.round(performance.now() - t0) })

  return NextResponse.json({
    ok: true,
    total: count || 0,
    limit,
    offset,
    candidatures: data || [],
  })
}

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, code }, { status })
}
