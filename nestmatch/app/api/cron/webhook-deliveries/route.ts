/**
 * V97.39.34 — Cron worker delivery webhooks
 *
 * Appelé toutes les 30 secondes par le systemd timer
 * `keymatch-cron-webhook-deliveries.timer` sur le VPS.
 *
 * Pop jusqu'à 20 deliveries pending dont next_attempt_at est passé, POST
 * vers leur URL, update le status. Retry géré par lib/agences/webhooks.ts.
 *
 * Auth : CRON_SECRET dans Bearer (cohérent autres routes /api/cron/*).
 */

import { NextRequest, NextResponse } from "next/server"
import { processDeliveriesBatch } from "@/lib/agences/webhooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60  // jusqu'à 60s pour processer le batch

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization") || ""
    if (!auth.startsWith("Bearer ") || auth.slice(7) !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
  }

  const t0 = Date.now()
  const result = await processDeliveriesBatch(20)
  return NextResponse.json({
    ok: true,
    processed: result.processed,
    duration_ms: Date.now() - t0,
  })
}
