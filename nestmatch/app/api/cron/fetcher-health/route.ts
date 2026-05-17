/**
 * V97.39.6 — GET /api/cron/fetcher-health
 *
 * Cron horaire (toutes les 6h via vercel.json) qui ping le worker
 * Zendriver self-host sur VPS OVH et enregistre la santé dans
 * `service_pings` pour traçabilité long terme.
 *
 * Si le worker est down 3 fois consécutives (sur 18h), on déclenche
 * un incident severity 'major' visible dans /admin (existant pattern
 * KeyMatch d'incidents auto).
 *
 * Auth : Bearer CRON_SECRET en prod.
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"
import { pingFetcherWorker } from "@/lib/import/fetcher-remote"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 15

const FAIL_THRESHOLD = 3

export const GET = withCronLogging(
  "fetcher-health",
  "0 */6 * * *",
  async (req: NextRequest) => {
    const secret = process.env.CRON_SECRET
    const auth = req.headers.get("authorization")
    if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const t0 = Date.now()
    const result = await pingFetcherWorker()
    const elapsed_ms = Date.now() - t0

    // Persiste dans service_pings (best-effort)
    try {
      await supabaseAdmin.from("service_pings").insert({
        service_name: "fetcher",
        status: result.ok ? "up" : "down",
        latency_ms: result.latency_ms,
        details: result.ok
          ? { uptime_s: (result.body as { uptime_s?: number })?.uptime_s }
          : { error: result.error, http_status: result.status },
      })
    } catch (e) {
      console.warn("[cron fetcher-health] service_pings insert failed:", (e as Error).message)
    }

    // Auto-incident : si 3 derniers pings consécutifs sont 'down'
    if (!result.ok) {
      try {
        const since = new Date(Date.now() - 18 * 3600 * 1000).toISOString() // dernier 18h
        const { data: recent } = await supabaseAdmin
          .from("service_pings")
          .select("status, created_at")
          .eq("service_name", "fetcher")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(FAIL_THRESHOLD)

        const lastN = (recent || []) as Array<{ status: string }>
        const allDown = lastN.length >= FAIL_THRESHOLD && lastN.every(r => r.status === "down")

        if (allDown) {
          // Check si un incident actif existe déjà pour fetcher
          const { count: openCount } = await supabaseAdmin
            .from("incidents")
            .select("id", { count: "exact", head: true })
            .eq("service", "fetcher")
            .is("resolved_at", null)

          if (!openCount || openCount === 0) {
            await supabaseAdmin.from("incidents").insert({
              service: "fetcher",
              severity: "major",
              title: "Worker Zendriver injoignable",
              description: `Le worker self-host (VPS OVH) ne répond plus depuis ${FAIL_THRESHOLD}+ pings consécutifs. Dernière erreur : ${result.error || "inconnue"}. Vérifie le container Docker et Caddy.`,
              is_public: false,
            })
          }
        }
      } catch (e) {
        console.warn("[cron fetcher-health] incident check failed:", (e as Error).message)
      }
    }

    return NextResponse.json({
      ok: true,
      worker_ok: result.ok,
      latency_ms: result.latency_ms,
      http_status: result.status || null,
      elapsed_ms,
      error: result.error || null,
    })
  },
)
