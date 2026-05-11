/**
 * V71.7 — GET /api/cron/health-check
 *
 * Cron auto-check qui ping /api/health/full en interne pour persister
 * automatiquement des health_pings et déclencher/résoudre les incidents.
 *
 * Stratégie : on fait un fetch HTTP local vers `/api/health/full`. Pourquoi
 * pas un import direct ? Parce que la route /api/health/full encapsule déjà
 * la logique end-to-end (checks parallèles + persistence + détection
 * transitions). Réutiliser via un fetch garde 1 source de vérité, au prix
 * d'un overhead de ~30ms (boucle locale Vercel).
 *
 * Schedule (cf. vercel.json) : `0 * * * *` (hourly) sur Pro, `0 8 * * *`
 * (daily) si Hobby. Pour cadence 5 min recommandée : Vercel Pro requis OU
 * monitoring externe (UptimeRobot, BetterStack) qui ping /api/health/full.
 *
 * Auth : Bearer CRON_SECRET en prod (pattern aligné sur les autres crons
 * KeyMatch — depot-retard, loyers-retard, etc.).
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function selfBaseUrl(req: NextRequest): string {
  // Priorise la variable d'env (canonique en prod) sinon le `host` reçu.
  const envBase = process.env.NEXT_PUBLIC_URL
  if (envBase) return envBase.replace(/\/$/, "")
  const host = req.headers.get("host")
  const proto = req.headers.get("x-forwarded-proto") || "https"
  if (host) return `${proto}://${host}`
  return "https://keymatch-immo.fr"
}

// V84.10 — wrapped avec withCronLogging pour persister chaque exécution
// dans cron_logs (visible /admin/operations).
export const GET = withCronLogging("health-check", "0 8 * * *", async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const t0 = Date.now()
  const target = `${selfBaseUrl(req)}/api/health/full?force=true`

  try {
    const res = await fetch(target, { method: "GET", cache: "no-store" })
    const data = await res.json().catch(() => null)
    const elapsed = Date.now() - t0

    return NextResponse.json({
      ok: true,
      target,
      status: data?.status ?? "unknown",
      services_count: Array.isArray(data?.services) ? data.services.length : 0,
      elapsed_ms: elapsed,
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      target,
    }, { status: 500 })
  }
})
