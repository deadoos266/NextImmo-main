/**
 * V97.39.34 — /v1/agences/[id]/annonces/[annonceId]
 *
 * GET    : récupère une annonce
 * PUT    : update partiel
 * DELETE : archive (set statut='loue_termine', pas de vrai DELETE)
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { verifyApiKey, hasScope, logApiUsage, extractApiKey } from "@/lib/agences/api-keys"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
// (merged with rateLimit)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function authenticate(req: NextRequest, id: string) {
  const presented = extractApiKey(req)
  if (!presented) return { error: jsonError(401, "API key missing", "AUTH_MISSING") }
  const key = await verifyApiKey(presented)
  if (!key) return { error: jsonError(401, "API key invalide", "AUTH_INVALID") }
  if (key.agence_id !== id) return { error: jsonError(403, "Wrong agence", "AUTH_WRONG_AGENCE") }
  return { key }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; annonceId: string }> }) {
  const t0 = performance.now()
  const { id, annonceId } = await ctx.params
  const ip = getClientIp(req.headers)
  const userAgent = req.headers.get("user-agent") || undefined

  const auth = await authenticate(req, id)
  if (auth.error) return auth.error
  const key = auth.key!
  if (!hasScope(key, "annonces:read")) return jsonError(403, "Scope annonces:read requis", "SCOPE")

  const rl = await checkRateLimitAsync(`api-key:${key.id}`, { max: 100, windowMs: 60 * 1000 })
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec)

  const { data, error } = await supabaseAdmin
    .from("annonces")
    .select("*")
    .eq("id", annonceId)
    .eq("agence_id", id)
    .single()

  const endpoint = "GET /v1/agences/:id/annonces/:annonceId"
  if (error || !data) {
    await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint, statusCode: 404, ip, userAgent, durationMs: ms(t0) })
    return jsonError(404, "Annonce introuvable", "NOT_FOUND")
  }
  await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint, statusCode: 200, ip, userAgent, durationMs: ms(t0) })
  return NextResponse.json({ ok: true, annonce: data })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string; annonceId: string }> }) {
  const t0 = performance.now()
  const { id, annonceId } = await ctx.params
  const ip = getClientIp(req.headers)
  const userAgent = req.headers.get("user-agent") || undefined

  const auth = await authenticate(req, id)
  if (auth.error) return auth.error
  const key = auth.key!
  if (!hasScope(key, "annonces:write")) return jsonError(403, "Scope annonces:write requis", "SCOPE")

  const rl = await checkRateLimitAsync(`api-key:${key.id}`, { max: 100, windowMs: 60 * 1000 })
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec)

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return jsonError(400, "JSON invalide", "INVALID_JSON")

  // Whitelist updatable fields (cohérent avec /v1/.../annonces POST)
  const WHITELIST = new Set([
    "titre", "description", "ville", "code_postal", "adresse",
    "prix", "charges", "caution", "surface", "pieces", "chambres",
    "etage", "dpe", "type_bien", "dispo", "photos", "external_ref",
    "meuble", "fibre", "parking", "cave", "balcon", "terrasse", "jardin", "ascenseur",
    "statut",
  ])
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (WHITELIST.has(k) && v !== undefined) {
      // Convertit nombres en string (cohérent avec schema legacy KeyMatch)
      if (["prix", "charges", "caution", "surface", "pieces", "chambres", "etage"].includes(k) && typeof v === "number") {
        update[k] = String(v)
      } else {
        update[k] = v
      }
    }
  }
  if (Object.keys(update).length === 0) {
    return jsonError(400, "Aucun champ à updater", "NO_FIELDS")
  }

  const { error } = await supabaseAdmin
    .from("annonces")
    .update(update)
    .eq("id", annonceId)
    .eq("agence_id", id)

  const endpoint = "PUT /v1/agences/:id/annonces/:annonceId"
  if (error) {
    await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint, statusCode: 500, ip, userAgent, durationMs: ms(t0), error: error.message })
    return jsonError(500, error.message, "DB_ERROR")
  }
  await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint, statusCode: 200, ip, userAgent, durationMs: ms(t0) })
  return NextResponse.json({ ok: true, id: annonceId, action: "updated" })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; annonceId: string }> }) {
  const t0 = performance.now()
  const { id, annonceId } = await ctx.params
  const ip = getClientIp(req.headers)
  const userAgent = req.headers.get("user-agent") || undefined

  const auth = await authenticate(req, id)
  if (auth.error) return auth.error
  const key = auth.key!
  if (!hasScope(key, "annonces:write")) return jsonError(403, "Scope annonces:write requis", "SCOPE")

  const rl = await checkRateLimitAsync(`api-key:${key.id}`, { max: 100, windowMs: 60 * 1000 })
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec)

  // Archive (pas DELETE hard) — set statut='loue_termine' (cohérent avec
  // workflow KeyMatch existant qui ne supprime jamais d'annonce).
  const { error } = await supabaseAdmin
    .from("annonces")
    .update({ statut: "loue_termine" })
    .eq("id", annonceId)
    .eq("agence_id", id)

  const endpoint = "DELETE /v1/agences/:id/annonces/:annonceId"
  if (error) {
    await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint, statusCode: 500, ip, userAgent, durationMs: ms(t0), error: error.message })
    return jsonError(500, error.message, "DB_ERROR")
  }
  await logApiUsage({ apiKeyId: key.id, agenceId: id, endpoint, statusCode: 200, ip, userAgent, durationMs: ms(t0) })
  return NextResponse.json({ ok: true, id: annonceId, action: "archived" })
}

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, code }, { status })
}
function rateLimitResponse(retryAfter?: number) {
  return new NextResponse(JSON.stringify({ ok: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), {
    status: 429,
    headers: { "Retry-After": String(retryAfter ?? 60) },
  })
}
function ms(t0: number) { return Math.round(performance.now() - t0) }
