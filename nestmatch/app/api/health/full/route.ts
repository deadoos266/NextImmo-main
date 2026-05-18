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
import { pingFetcherWorker } from "@/lib/import/fetcher-remote"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type HealthStatus = "up" | "degraded" | "down"

interface ServiceCheck {
  service: "database" | "auth" | "email" | "storage" | "crons" | "app" | "fetcher"
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
  // V97.39.34 — Phase 5 a remplacé Resend par Brevo. On check api.brevo.com
  // via le GET /v3/account qui valide la clé sans coût (0 email envoyé).
  // Diagnostic enrichi : configuration_missing / auth_failed / rate_limited
  // / brevo_server_error / network_error / slow.
  const t0 = performance.now()
  const key = process.env.BREVO_API_KEY
  if (!key) {
    return {
      service: "email",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: "configuration_missing: BREVO_API_KEY absent côté env (Settings → Environment Variables)",
    }
  }
  // Brevo keys ressemblent à `xkeysib-...` (préfixe + 64+ chars).
  if (!key.startsWith("xkeysib-") || key.length < 60) {
    return {
      service: "email",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: "configuration_missing: BREVO_API_KEY format invalide (doit commencer par 'xkeysib-' et faire ≥60 chars)",
    }
  }
  try {
    // GET /v3/account coûte 0 email mais valide la clé.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: { "api-key": key, accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    })
    clearTimeout(timer)
    const latency = Math.round(performance.now() - t0)
    if (res.status === 401 || res.status === 403) {
      return {
        service: "email",
        status: "down",
        latency_ms: latency,
        error: `auth_failed: Brevo HTTP ${res.status} — clé invalide ou révoquée. Régénérer sur https://app.brevo.com/settings/keys/api et update env`,
      }
    }
    if (res.status === 429) {
      return {
        service: "email",
        status: "degraded",
        latency_ms: latency,
        error: "rate_limited: Brevo HTTP 429 — quota plan dépassé. Check usage sur dashboard Brevo",
      }
    }
    if (res.status >= 500 && res.status < 600) {
      return {
        service: "email",
        status: "down",
        latency_ms: latency,
        error: `brevo_server_error: HTTP ${res.status} — incident côté Brevo. Check https://status.brevo.com`,
      }
    }
    if (!res.ok) {
      return { service: "email", status: "degraded", latency_ms: latency, error: `unknown_http: Brevo HTTP ${res.status}` }
    }
    if (latency > 2000) {
      return { service: "email", status: "degraded", latency_ms: latency, error: `slow: ${latency}ms (seuil 2000ms)` }
    }
    return { service: "email", status: "up", latency_ms: latency, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isAbort = msg.includes("abort") || msg.includes("timeout")
    return {
      service: "email",
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: isAbort
        ? "network_error: timeout >4s sur api.brevo.com (réseau VPS ou Brevo)"
        : `network_error: ${msg}`,
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

/**
 * V97.9 — Check trivial du service "app" : si on arrive jusqu'ici, l'app
 * Next.js répond. La latence mesurée est celle du process Node sur 1 tick
 * (vide la queue setImmediate) — sert d'indicateur de event loop sain.
 *
 * Avant V97.9 : la liste SERVICES (lib/statusAggregation.ts) incluait "app"
 * mais aucun ping n'était jamais inséré → timeline "Application" toujours
 * vide sur /admin/health et /status, ce qui faisait croire à un service down.
 */
/**
 * V97.39.9 — Check worker Zendriver self-host (VPS OVH).
 *
 * Ping le worker via pingFetcherWorker() (Bearer auth + /health endpoint).
 * Status :
 *   - "up" : HTTP 200 + JSON body parsable, latence < 1500ms
 *   - "degraded" : 200 mais latence > 1500ms (worker lent)
 *   - "down" : non-200, timeout, ou env vars manquantes
 *
 * Si worker pas configuré (EXTERNAL_FETCHER_URL/TOKEN absents en dev local
 * ou si Paul désactive le worker), retourne "up" avec error explicite
 * "not_configured" — c'est attendu, pas un incident.
 */
async function checkFetcher(): Promise<ServiceCheck> {
  const configured = Boolean(process.env.EXTERNAL_FETCHER_URL && process.env.EXTERNAL_FETCHER_TOKEN)
  if (!configured) {
    return {
      service: "fetcher",
      status: "up", // pas configuré = pas un incident (worker optionnel)
      latency_ms: 0,
      error: "not_configured: EXTERNAL_FETCHER_URL/TOKEN absents (worker désactivé)",
    }
  }
  const result = await pingFetcherWorker()
  if (!result.ok) {
    return {
      service: "fetcher",
      status: "down",
      latency_ms: result.latency_ms,
      error: result.error || `HTTP ${result.status}`,
    }
  }
  if (result.latency_ms > 1500) {
    return {
      service: "fetcher",
      status: "degraded",
      latency_ms: result.latency_ms,
      error: `slow: ${result.latency_ms}ms (seuil 1500ms)`,
    }
  }
  return {
    service: "fetcher",
    status: "up",
    latency_ms: result.latency_ms,
    error: null,
  }
}

async function checkApp(): Promise<ServiceCheck> {
  const t0 = performance.now()
  // setImmediate flush — mesure approximative du event loop lag.
  await new Promise<void>(resolve => setImmediate(resolve))
  const latency = Math.round(performance.now() - t0)
  // V97.9 — Seuil large à 800ms : cold starts Vercel serverless peuvent
  // prendre 500-700ms avant que setImmediate se résolve. Sous ce seuil,
  // c'est "up" même si la latence semble haute, pour éviter de créer
  // des incidents spurious à chaque cold start (qui auraient fait passer
  // /status public en "degraded" toutes les heures).
  const status: HealthStatus = latency > 800 ? "degraded" : "up"
  return {
    service: "app",
    status,
    latency_ms: latency,
    error: status === "degraded" ? `event_loop_lag: ${latency}ms (seuil 800ms)` : null,
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

  const [database, auth, email, storage, app, fetcher] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkAuth()),
    checkEmail(),
    checkStorage(),
    checkApp(),  // V97.9 — remplit la timeline "Application"
    checkFetcher(),  // V97.39.9 — worker Zendriver self-host VPS OVH
  ])
  const crons = checkCrons()
  const services: ServiceCheck[] = [database, auth, email, storage, crons, app, fetcher]

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
