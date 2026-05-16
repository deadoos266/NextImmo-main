/**
 * V97.39 P3-7 Phase 1 — GET /api/admin/fetcher-health
 *
 * Ping le worker Zendriver self-host (EXTERNAL_FETCHER_URL/health) avec le
 * Bearer token, retourne le statut + latence + stats du pool de browsers.
 *
 * Auth : admin requis.
 *
 * Utilisé par /admin/imports pour afficher la santé du worker à côté
 * des stats d'imports. Couplable avec un cron horaire pour alerter.
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { pingFetcherWorker } from "@/lib/import/fetcher-remote"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!session || !(session as any).user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const result = await pingFetcherWorker()
  return NextResponse.json({
    ok: result.ok,
    worker_url: process.env.EXTERNAL_FETCHER_URL || null,
    configured: Boolean(process.env.EXTERNAL_FETCHER_URL && process.env.EXTERNAL_FETCHER_TOKEN),
    enabled_hosts: (process.env.EXTERNAL_FETCHER_ENABLED_HOSTS || "").split(",").map(h => h.trim()).filter(Boolean),
    latency_ms: result.latency_ms,
    http_status: result.status || null,
    pool: (result.body as { pool?: unknown })?.pool || null,
    uptime_s: (result.body as { uptime_s?: number })?.uptime_s || null,
    error: result.error || null,
    checked_at: new Date().toISOString(),
  })
}
