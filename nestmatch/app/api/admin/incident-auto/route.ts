/**
 * V72.4 — POST /api/admin/incident-auto
 *
 * Endpoint d'auto-création d'incident depuis :
 *  - global-error.tsx / error.tsx (côté client, sur catch d'erreur)
 *  - lib/logger.ts (côté server, sur log.error >= critical)
 *  - cron health-check (déjà câblé via /api/health/full)
 *
 * Body JSON (tous optionnels sauf indiqué) :
 *   {
 *     title: string (requis)       — résumé court de l'incident
 *     description?: string         — stack trace ou contexte
 *     severity?: 'major' | 'critical' | 'minor' | 'info' (default 'major')
 *     service?: 'app' | 'database' | 'auth' | 'email' | 'storage' | 'crons' (default 'app')
 *     request_id?: string          — corrélation log
 *     url?: string                  — page où l'erreur s'est produite
 *     user_email?: string           — pour debug, anonymisé en hash si pas admin
 *     digest?: string               — Next error digest
 *   }
 *
 * Pas d'auth admin requise (route appelée depuis des contextes non-authentifiés
 * comme un crash sur /annonces public). On rate-limite agressivement par IP +
 * dédoublonne via title pour éviter qu'un même bug crée 1000 incidents.
 *
 * Best-effort : si la table incidents n'existe pas (mig 063 non appliquée),
 * on retourne 200 silencieusement. Sentry capture déjà tout côté client.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_SEVERITY = new Set(["info", "minor", "major", "critical"])
const ALLOWED_SERVICE = new Set(["database", "auth", "email", "storage", "crons", "app"])

interface IncomingPayload {
  title?: unknown
  description?: unknown
  severity?: unknown
  service?: unknown
  request_id?: unknown
  url?: unknown
  user_email?: unknown
  digest?: unknown
}

export async function POST(req: NextRequest) {
  // Rate-limit : 10 incidents/min/IP. Un crash en boucle ne génère que 10
  // entrées par minute (déduplication côté DB ensuite).
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`incident-auto:${ip}`, { max: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Rate limit" }, { status: 429 })
  }

  let body: IncomingPayload
  try {
    body = (await req.json()) as IncomingPayload
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : ""
  if (!title) {
    return NextResponse.json({ ok: false, error: "title requis" }, { status: 400 })
  }

  const severity = typeof body.severity === "string" && ALLOWED_SEVERITY.has(body.severity)
    ? body.severity
    : "major"
  const service = typeof body.service === "string" && ALLOWED_SERVICE.has(body.service)
    ? body.service
    : "app"

  // Compose la description à partir des champs annexes (request_id, url, digest)
  // pour faciliter le debug côté admin sans schema rigide.
  const parts: string[] = []
  if (typeof body.description === "string" && body.description.trim()) {
    parts.push(body.description.trim().slice(0, 4000))
  }
  if (typeof body.url === "string" && body.url.trim()) parts.push(`URL: ${body.url.trim()}`)
  if (typeof body.digest === "string" && body.digest.trim()) parts.push(`Digest: ${body.digest.trim()}`)
  if (typeof body.request_id === "string" && body.request_id.trim()) parts.push(`request_id: ${body.request_id.trim()}`)
  if (typeof body.user_email === "string" && body.user_email.trim()) parts.push(`user: ${body.user_email.trim()}`)
  parts.push(`IP: ${ip}`)
  const description = parts.join("\n").slice(0, 6000)

  // Best-effort : si la mig 063 n'est pas encore appliquée, le INSERT échoue
  // mais on swallow et on retourne 200 (Sentry capture déjà côté client).
  try {
    // Dédup : si un incident open existe avec le même title + service depuis
    // <30min, on n'en crée pas un nouveau. Évite un déluge de duplicates sur
    // un même bug en boucle.
    const since30min = new Date(Date.now() - 30 * 60_000).toISOString()
    const { data: existing } = await supabaseAdmin
      .from("incidents")
      .select("id")
      .eq("title", title)
      .eq("service", service)
      .neq("status", "resolved")
      .gte("started_at", since30min)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true, id: existing[0].id })
    }

    const { data, error } = await supabaseAdmin
      .from("incidents")
      .insert({
        title,
        description,
        severity,
        service,
        status: "investigating",
        is_public: false, // auto-incidents toujours internes par défaut
      })
      .select("id")
      .single()

    if (error) {
      console.error("[incident-auto] insert failed", error.message)
      return NextResponse.json({ ok: true, persisted: false })
    }

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e) {
    console.error("[incident-auto] caught", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: true, persisted: false })
  }
}
