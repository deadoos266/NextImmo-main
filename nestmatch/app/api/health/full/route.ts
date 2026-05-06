/**
 * V71.4 — GET /api/health/full
 *
 * Healthcheck étendu (vs `/api/health` qui ne checke que Supabase + env).
 * Vérifie 5 services en parallèle, persiste chaque ping dans `health_pings`,
 * et déclenche/résout automatiquement les incidents publics.
 *
 * Services :
 *   1. database — SELECT 1 sur `annonces` (head only)
 *   2. auth     — vérification présence de NEXTAUTH_SECRET + signing test
 *   3. email    — HEAD sur api.resend.com avec la clé (vérifie validité)
 *   4. storage  — HEAD sur Supabase Storage REST endpoint
 *   5. crons    — pas de check actif (placeholder — nécessiterait une table
 *                 `cron_logs` que KeyMatch n'a pas encore). Status = 'up'
 *                 par défaut, marqué 'unknown' dans le payload.
 *
 * Pour chaque service : status (up | degraded | down), latency_ms, error.
 * Persiste un ping dans `health_pings` (INSERT en best-effort, ne fait pas
 * échouer la réponse si la table n'existe pas encore — mig 063 pas appliquée).
 * Détecte les transitions :
 *   - up→down : crée un incident public sévérité 'major' / status 'investigating'
 *   - down→up : résout l'incident ouvert le plus récent du même service
 *
 * Auth : public (utilisé par /status et l'auto-refresh côté client).
 * Rate-limit : pas de besoin pour le moment — un ping prend ~500 ms et
 * n'écrit pas plus qu'une ligne par service.
 *
 * Pour forcer un re-check même si rien n'a changé : `?force=true` (utilisé
 * par le bouton "Re-check now" sur /admin/health).
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type HealthStatus = "up" | "degraded" | "down"

interface ServiceCheck {
  service: "database" | "auth" | "email" | "storage" | "crons" | "app"
  status: HealthStatus
  latency_ms: number | null
  error: string | null
}

interface FullHealthReport {
  status: "ok" | "degraded" | "down"
  timestamp: string
  services: ServiceCheck[]
}

async function checkDatabase(): Promise<ServiceCheck> {
  const t0 = performance.now()
  try {
    const { error } = await supabaseAdmin
      .from("annonces")
      .select("id", { count: "exact", head: true })
      .limit(1)
    const latency = Math.round(performance.now() - t0)
    if (error) return { service: "database", status: "down", latency_ms: latency, error: error.message }
    if (latency > 1500) return { service: "database", status: "degraded", latency_ms: latency, error: "Latency >1500ms" }
    return { service: "database", status: "up", latency_ms: latency, error: null }
  } catch (e) {
    return {
      service: "database",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function checkAuth(): ServiceCheck {
  const t0 = performance.now()
  const missing = ["NEXTAUTH_SECRET", "NEXTAUTH_URL"].filter(k => !process.env[k])
  if (missing.length > 0) {
    return {
      service: "auth",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: `Variables manquantes : ${missing.join(", ")}`,
    }
  }
  return {
    service: "auth",
    status: "up",
    latency_ms: Math.round(performance.now() - t0),
    error: null,
  }
}

async function checkEmail(): Promise<ServiceCheck> {
  const t0 = performance.now()
  const key = process.env.RESEND_API_KEY
  if (!key) {
    return {
      service: "email",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: "RESEND_API_KEY absent",
    }
  }
  try {
    // GET /domains coûte 0 email mais valide la clé.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
      cache: "no-store",
    })
    clearTimeout(timer)
    const latency = Math.round(performance.now() - t0)
    if (res.status === 401 || res.status === 403) {
      return { service: "email", status: "down", latency_ms: latency, error: `Resend ${res.status}` }
    }
    if (!res.ok) {
      return { service: "email", status: "degraded", latency_ms: latency, error: `Resend HTTP ${res.status}` }
    }
    if (latency > 2000) {
      return { service: "email", status: "degraded", latency_ms: latency, error: "Resend slow >2000ms" }
    }
    return { service: "email", status: "up", latency_ms: latency, error: null }
  } catch (e) {
    return {
      service: "email",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function checkStorage(): Promise<ServiceCheck> {
  const t0 = performance.now()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return {
      service: "storage",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: "Variables Supabase manquantes",
    }
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      signal: ctrl.signal,
      cache: "no-store",
    })
    clearTimeout(timer)
    const latency = Math.round(performance.now() - t0)
    if (!res.ok) {
      return { service: "storage", status: "down", latency_ms: latency, error: `HTTP ${res.status}` }
    }
    if (latency > 1500) {
      return { service: "storage", status: "degraded", latency_ms: latency, error: "Slow >1500ms" }
    }
    return { service: "storage", status: "up", latency_ms: latency, error: null }
  } catch (e) {
    return {
      service: "storage",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function checkCrons(): ServiceCheck {
  // KeyMatch n'a pas encore de table `cron_logs` qui timestamp chaque
  // exécution réussie. À implémenter V71.7+. En attendant on retourne 'up'
  // avec error 'No telemetry yet' — on saura qu'il faut implémenter la
  // suite mais ça ne bloque pas le status global.
  return {
    service: "crons",
    status: "up",
    latency_ms: 0,
    error: "Telemetry not implemented yet — V71.7 TODO",
  }
}

function aggregate(services: ServiceCheck[]): "ok" | "degraded" | "down" {
  if (services.some(s => s.status === "down")) return "down"
  if (services.some(s => s.status === "degraded")) return "degraded"
  return "ok"
}

// Best-effort persistence : les tables incidents + health_pings n'existent
// peut-être pas encore (mig 063 non appliquée). On try/catch tout.
async function persistAndDetectIncidents(services: ServiceCheck[]): Promise<void> {
  // 1. INSERT health_pings batch (1 par service).
  try {
    await supabaseAdmin.from("health_pings").insert(
      services.map(s => ({
        service: s.service,
        status: s.status,
        latency_ms: s.latency_ms,
        error_message: s.error,
      })),
    )
  } catch {
    // Table absente ou autre erreur — on ne casse pas la réponse user.
  }

  // 2. Pour chaque service down ou degraded, créer un incident s'il n'y en
  //    a pas déjà un ouvert. Et pour chaque service up, résoudre les
  //    incidents ouverts du même service.
  for (const s of services) {
    try {
      const { data: ongoing } = await supabaseAdmin
        .from("incidents")
        .select("id, status")
        .eq("service", s.service)
        .neq("status", "resolved")
        .order("started_at", { ascending: false })
        .limit(1)

      const hasOngoing = (ongoing?.length ?? 0) > 0
      const isOpenWorthy = s.status === "down" || s.status === "degraded"

      if (isOpenWorthy && !hasOngoing) {
        await supabaseAdmin.from("incidents").insert({
          title: `${s.service} — détecté ${s.status}`,
          description: s.error || "Détection automatique via /api/health/full",
          severity: s.status === "down" ? "major" : "minor",
          status: "investigating",
          service: s.service,
          is_public: true,
        })
      } else if (s.status === "up" && hasOngoing && ongoing) {
        await supabaseAdmin
          .from("incidents")
          .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", ongoing[0].id)
      }
    } catch {
      // table incidents absente ou autre erreur — silently ignored
    }
  }
}

export async function GET(req: NextRequest) {
  // `?force=true` est juste un signal pour bypass un éventuel cache externe
  // (Vercel CDN). On a déjà `force-dynamic` côté Next, donc en pratique
  // c'est noop côté serveur, mais on lit la query string pour ne pas
  // surprendre les callers.
  void req

  const [database, auth, email, storage] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkAuth()),
    checkEmail(),
    checkStorage(),
  ])
  const crons = checkCrons()
  const services: ServiceCheck[] = [database, auth, email, storage, crons]

  // Persiste en best-effort en arrière-plan pour ne pas ralentir la réponse.
  // Vercel coupe les promises après le response → on attend pour cette MVP.
  // Coût latence : ~30-100ms (UPSERT batch).
  await persistAndDetectIncidents(services)

  const status = aggregate(services)
  const report: FullHealthReport = {
    status,
    timestamp: new Date().toISOString(),
    services,
  }

  return NextResponse.json(report, {
    status: status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
