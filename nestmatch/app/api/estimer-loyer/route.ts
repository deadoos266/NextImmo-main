/**
 * V97.34 P3-9 — GET /api/estimer-loyer
 *
 * Estime un loyer de marché pour aider les proprios à fixer leur prix.
 * Basé sur les annonces existantes dans KeyMatch (médiane + min + max
 * par paramètres compatibles).
 *
 * Params query :
 *   - ville (string, required) : ville du logement
 *   - surface (number, required) : surface en m² (matching ±20%)
 *   - pieces (number, optional) : nb de pièces (matching exact)
 *   - meuble (boolean, optional) : meublé ou non (matching exact si fourni)
 *
 * Réponse :
 *   {
 *     ok: true,
 *     basis: { ville, surface, pieces, meuble },
 *     sample_size: 17,
 *     median: 1200,
 *     min: 850,
 *     max: 1850,
 *     percentile_25: 1050,
 *     percentile_75: 1400,
 *     price_per_m2: { median: 24, min: 18, max: 38 },
 *     confidence: "high" | "medium" | "low",
 *     hint: "Données basées sur N annonces similaires à Paris."
 *   }
 *
 * Auth : public (un proprio non encore inscrit peut tester avant signup).
 * Rate-limit léger 60/heure par IP (anti-abus).
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SURFACE_TOLERANCE_PCT = 20  // ±20% sur la surface
const MIN_SAMPLE_SIZE = 5
const MAX_RESULTS = 500

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.floor((pct / 100) * (sorted.length - 1))
  return Math.round(sorted[Math.max(0, Math.min(sorted.length - 1, idx))])
}

export async function GET(req: NextRequest) {
  // Rate-limit IP léger (public route)
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`estimer-loyer:ip:${ip}`, { max: 60, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de requêtes, réessayez plus tard." }, { status: 429 })
  }

  const sp = req.nextUrl.searchParams
  const ville = (sp.get("ville") || "").trim()
  const surface = Number(sp.get("surface") || 0)
  const piecesRaw = sp.get("pieces")
  const pieces = piecesRaw !== null ? Number(piecesRaw) : null
  const meubleRaw = sp.get("meuble")
  const meuble = meubleRaw !== null ? (meubleRaw === "true" || meubleRaw === "1") : null

  if (!ville || ville.length < 2) {
    return NextResponse.json({ ok: false, error: "ville requise" }, { status: 400 })
  }
  if (!Number.isFinite(surface) || surface < 5 || surface > 1000) {
    return NextResponse.json({ ok: false, error: "surface invalide (5-1000 m²)" }, { status: 400 })
  }

  const surfaceMin = surface * (1 - SURFACE_TOLERANCE_PCT / 100)
  const surfaceMax = surface * (1 + SURFACE_TOLERANCE_PCT / 100)

  // Fetch annonces correspondantes : même ville (ilike), surface ±20%,
  // pièces exact si fourni, meublé exact si fourni, statut disponible
  // ou loué récent (les loués gardent leur prix négocié = data utile).
  let q = supabaseAdmin
    .from("annonces")
    .select("prix, charges, surface, pieces, meuble")
    // Wildcards `%` autour pour matcher "Paris 15e" depuis "Paris" (parité
    // avec l'ancien lib/marketRent.ts). Escape `%` et `_` dans la saisie
    // utilisateur pour éviter qu'ils n'aient effet de wildcards.
    .ilike("ville", `%${ville.replace(/[%_]/g, m => "\\" + m)}%`)
    .gte("surface", surfaceMin)
    .lte("surface", surfaceMax)
    .eq("is_test", false)
    .not("prix", "is", null)
    .gt("prix", 0)
    .limit(MAX_RESULTS)

  if (pieces !== null && Number.isFinite(pieces) && pieces >= 1) {
    q = q.eq("pieces", pieces)
  }
  if (meuble !== null) {
    q = q.eq("meuble", meuble)
  }

  const { data, error } = await q
  if (error) {
    console.error("[estimer-loyer]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  const rows = (data || []).filter(a => Number.isFinite(Number(a.prix)) && Number(a.surface) > 0)

  if (rows.length < MIN_SAMPLE_SIZE) {
    return NextResponse.json({
      ok: true,
      basis: { ville, surface, pieces, meuble },
      sample_size: rows.length,
      confidence: "low",
      hint: rows.length === 0
        ? `Aucune annonce similaire trouvée à ${ville} pour ${surface}m²${pieces ? ` ${pieces}P` : ""}${meuble === true ? " meublé" : meuble === false ? " vide" : ""}.`
        : `Seulement ${rows.length} annonce${rows.length > 1 ? "s" : ""} similaire${rows.length > 1 ? "s" : ""}. Précision faible.`,
    })
  }

  // Prix CC (charges incluses) pour avoir un comparable utile
  const pricesCC = rows.map(a => Number(a.prix) + (Number(a.charges) || 0))
  const pricesPerM2 = rows.map(a => (Number(a.prix) + (Number(a.charges) || 0)) / Number(a.surface))

  const confidence: "high" | "medium" | "low" =
    rows.length >= 30 ? "high" : rows.length >= 15 ? "medium" : "low"

  return NextResponse.json({
    ok: true,
    basis: { ville, surface, pieces, meuble },
    sample_size: rows.length,
    median: median(pricesCC),
    min: Math.round(Math.min(...pricesCC)),
    max: Math.round(Math.max(...pricesCC)),
    percentile_25: percentile(pricesCC, 25),
    percentile_75: percentile(pricesCC, 75),
    price_per_m2: {
      median: Math.round(median(pricesPerM2)),
      min: Math.round(Math.min(...pricesPerM2)),
      max: Math.round(Math.max(...pricesPerM2)),
    },
    confidence,
    hint: `Estimation basée sur ${rows.length} annonces KeyMatch à ${ville}, surface ${Math.round(surfaceMin)}-${Math.round(surfaceMax)} m²${pieces ? `, ${pieces} pièces` : ""}${meuble === true ? ", meublé" : meuble === false ? ", non meublé" : ""}.`,
  })
}
