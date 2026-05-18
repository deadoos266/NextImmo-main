/**
 * V97.39.34 — API REST publique /v1/agences/[id]/annonces
 *
 * GET  : list les annonces de l'agence (paginated, filterable)
 * POST : crée une nouvelle annonce (idempotent via external_ref si fourni)
 *
 * Auth : Bearer API key (scope annonces:read pour GET, annonces:write pour POST).
 *
 * Rate-limit : 100 req/min par clé (sliding window via Upstash).
 *
 * Headers de réponse :
 *   X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 *
 * Exemples curl :
 *   curl -H "Authorization: Bearer km_live_xxx" https://keymatch-immo.fr/api/v1/agences/UUID/annonces
 *   curl -X POST -H "Authorization: Bearer km_live_xxx" -H "Content-Type: application/json" \
 *        -d '{"titre":"Studio Paris 11","ville":"Paris","prix":900,"surface":22}' \
 *        https://keymatch-immo.fr/api/v1/agences/UUID/annonces
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { verifyApiKey, hasScope, logApiUsage, extractApiKey } from "@/lib/agences/api-keys"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
// (merged with rateLimit)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface CreateAnnonceBody {
  titre: string
  description?: string
  ville?: string
  code_postal?: string
  adresse?: string
  prix: number
  charges?: number
  caution?: number
  surface?: number
  pieces?: number
  chambres?: number
  etage?: number
  dpe?: string
  type_bien?: string
  dispo?: string
  photos?: string[]
  external_ref?: string
  // Toggles équipements
  meuble?: boolean
  fibre?: boolean
  parking?: boolean
  cave?: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  ascenseur?: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// GET /v1/agences/[id]/annonces
// ──────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t0 = performance.now()
  const { id } = await ctx.params
  const ip = getClientIp(req.headers)
  const userAgent = req.headers.get("user-agent") || undefined

  const presented = extractApiKey(req)
  if (!presented) {
    return jsonError(401, "API key missing", "AUTH_MISSING")
  }
  const key = await verifyApiKey(presented)
  if (!key) {
    return jsonError(401, "API key invalide ou révoquée", "AUTH_INVALID")
  }
  if (key.agence_id !== id) {
    return jsonError(403, "Cette API key n'appartient pas à cette agence", "AUTH_WRONG_AGENCE")
  }
  if (!hasScope(key, "annonces:read")) {
    return jsonError(403, "Scope annonces:read requis", "SCOPE_FORBIDDEN")
  }

  // Rate limit : 100 req/min par clé
  const rl = await checkRateLimitAsync(`api-key:${key.id}`, { max: 100, windowMs: 60 * 1000 })
  if (!rl.allowed) {
    const headers = new Headers({
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "0",
      "Retry-After": String(rl.retryAfterSec ?? 60),
    })
    await logApiUsage({
      apiKeyId: key.id, agenceId: key.agence_id, endpoint: "GET /v1/agences/:id/annonces",
      statusCode: 429, ip, userAgent, durationMs: Math.round(performance.now() - t0),
      error: "Rate limit exceeded",
    })
    return new NextResponse(JSON.stringify({ ok: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), { status: 429, headers })
  }

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200)
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0)

  const { data, error, count } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, description, ville, adresse, code_postal, prix, charges, caution, surface, pieces, chambres, etage, dpe, type_bien, photos, statut, external_ref, meuble, fibre, parking, cave, balcon, terrasse, jardin, ascenseur, created_at, updated_at", { count: "exact" })
    .eq("agence_id", id)
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    await logApiUsage({
      apiKeyId: key.id, agenceId: key.agence_id, endpoint: "GET /v1/agences/:id/annonces",
      statusCode: 500, ip, userAgent, durationMs: Math.round(performance.now() - t0), error: error.message,
    })
    return jsonError(500, error.message, "DB_ERROR")
  }

  await logApiUsage({
    apiKeyId: key.id, agenceId: key.agence_id, endpoint: "GET /v1/agences/:id/annonces",
    statusCode: 200, ip, userAgent, durationMs: Math.round(performance.now() - t0),
  })

  return NextResponse.json({
    ok: true,
    total: count || 0,
    limit,
    offset,
    annonces: data || [],
  }, {
    headers: {
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": String(rl.remaining ?? 0),
    },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// POST /v1/agences/[id]/annonces
// ──────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t0 = performance.now()
  const { id } = await ctx.params
  const ip = getClientIp(req.headers)
  const userAgent = req.headers.get("user-agent") || undefined

  const presented = extractApiKey(req)
  if (!presented) return jsonError(401, "API key missing", "AUTH_MISSING")
  const key = await verifyApiKey(presented)
  if (!key) return jsonError(401, "API key invalide ou révoquée", "AUTH_INVALID")
  if (key.agence_id !== id) return jsonError(403, "Wrong agence", "AUTH_WRONG_AGENCE")
  if (!hasScope(key, "annonces:write")) {
    return jsonError(403, "Scope annonces:write requis", "SCOPE_FORBIDDEN")
  }

  const rl = await checkRateLimitAsync(`api-key:${key.id}`, { max: 100, windowMs: 60 * 1000 })
  if (!rl.allowed) {
    await logApiUsage({
      apiKeyId: key.id, agenceId: key.agence_id, endpoint: "POST /v1/agences/:id/annonces",
      statusCode: 429, ip, userAgent, durationMs: Math.round(performance.now() - t0),
      error: "Rate limit",
    })
    return new NextResponse(JSON.stringify({ ok: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec ?? 60) },
    })
  }

  const body = (await req.json().catch(() => null)) as CreateAnnonceBody | null
  if (!body) return jsonError(400, "JSON body invalide", "INVALID_JSON")
  if (!body.titre || body.titre.length < 3) return jsonError(422, "titre requis (3+ chars)", "VALIDATION")
  if (!body.prix || body.prix <= 0) return jsonError(422, "prix > 0 requis", "VALIDATION")

  // UPSERT par external_ref si fourni
  const externalRef = body.external_ref?.trim() || null
  let existingId: number | null = null
  if (externalRef) {
    const { data: existing } = await supabaseAdmin
      .from("annonces")
      .select("id")
      .eq("agence_id", id)
      .eq("external_ref", externalRef)
      .limit(1)
      .maybeSingle()
    existingId = existing?.id ?? null
  }

  const payload: Record<string, unknown> = {
    agence_id: id,
    proprietaire: key.agenceName,
    proprietaire_email: key.created_by,  // créateur de la clé comme owner par défaut
    titre: body.titre.substring(0, 200),
    description: body.description?.substring(0, 5000),
    ville: body.ville,
    code_postal: body.code_postal,
    adresse: body.adresse,
    prix: body.prix != null ? String(body.prix) : null,
    charges: body.charges != null ? String(body.charges) : null,
    caution: body.caution != null ? String(body.caution) : null,
    surface: body.surface != null ? String(body.surface) : null,
    pieces: body.pieces != null ? String(body.pieces) : null,
    chambres: body.chambres != null ? String(body.chambres) : null,
    etage: body.etage != null ? String(body.etage) : null,
    dpe: body.dpe,
    type_bien: body.type_bien,
    dispo: body.dispo,
    photos: body.photos,
    external_ref: externalRef,
    meuble: body.meuble,
    fibre: body.fibre,
    parking: body.parking,
    cave: body.cave,
    balcon: body.balcon,
    terrasse: body.terrasse,
    jardin: body.jardin,
    ascenseur: body.ascenseur,
    membre: "Membre depuis " + new Date().getFullYear(),
    verifie: true,
    statut: "disponible",
    is_test: false,
  }
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined || payload[k] === null) delete payload[k]
  }

  if (existingId) {
    // UPDATE
    const { error: updErr } = await supabaseAdmin
      .from("annonces")
      .update(payload)
      .eq("id", existingId)
    if (updErr) {
      await logApiUsage({
        apiKeyId: key.id, agenceId: key.agence_id, endpoint: "POST /v1/agences/:id/annonces",
        statusCode: 500, ip, userAgent, durationMs: Math.round(performance.now() - t0), error: updErr.message,
      })
      return jsonError(500, updErr.message, "DB_ERROR")
    }
    await logApiUsage({
      apiKeyId: key.id, agenceId: key.agence_id, endpoint: "POST /v1/agences/:id/annonces (update)",
      statusCode: 200, ip, userAgent, durationMs: Math.round(performance.now() - t0),
    })
    return NextResponse.json({ ok: true, id: existingId, action: "updated", external_ref: externalRef })
  }

  // INSERT
  const { data: ins, error: insErr } = await supabaseAdmin
    .from("annonces")
    .insert(payload)
    .select("id")
    .single()
  if (insErr || !ins) {
    await logApiUsage({
      apiKeyId: key.id, agenceId: key.agence_id, endpoint: "POST /v1/agences/:id/annonces",
      statusCode: 500, ip, userAgent, durationMs: Math.round(performance.now() - t0), error: insErr?.message,
    })
    return jsonError(500, insErr?.message || "Insert error", "DB_ERROR")
  }

  await logApiUsage({
    apiKeyId: key.id, agenceId: key.agence_id, endpoint: "POST /v1/agences/:id/annonces",
    statusCode: 201, ip, userAgent, durationMs: Math.round(performance.now() - t0),
  })
  return NextResponse.json({ ok: true, id: ins.id, action: "created", external_ref: externalRef }, { status: 201 })
}

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, code }, { status })
}
