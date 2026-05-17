/**
 * V97.39.6 — GET /api/cron/import-jobs-cleanup
 *
 * Cron quotidien (4h15) qui purge la table `import_jobs` :
 *  - status='pending' AND age > 1h    → zombies abandonnés (user a fermé l'onglet)
 *  - status='processing' AND age > 1h → worker a crashé pendant le fetch
 *  - status IN ('done','failed') AND age > 7j → rétention (les jobs sont éphémères)
 *
 * Auth : Bearer CRON_SECRET en prod.
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export const GET = withCronLogging(
  "import-jobs-cleanup",
  "15 4 * * *",
  async (req: NextRequest) => {
    const secret = process.env.CRON_SECRET
    const auth = req.headers.get("authorization")
    if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

    let deletedZombies = 0
    let deletedOld = 0

    // Zombies : pending/processing > 1h
    try {
      const { error, count } = await supabaseAdmin
        .from("import_jobs")
        .delete({ count: "exact" })
        .in("status", ["pending", "processing"])
        .lt("created_at", oneHourAgo)
      if (error) {
        console.warn("[cron cleanup zombies]", error.message)
      } else {
        deletedZombies = count || 0
      }
    } catch (e) {
      console.warn("[cron cleanup zombies] threw:", (e as Error).message)
    }

    // Anciens : done/failed > 7j
    try {
      const { error, count } = await supabaseAdmin
        .from("import_jobs")
        .delete({ count: "exact" })
        .in("status", ["done", "failed"])
        .lt("created_at", sevenDaysAgo)
      if (error) {
        console.warn("[cron cleanup old]", error.message)
      } else {
        deletedOld = count || 0
      }
    } catch (e) {
      console.warn("[cron cleanup old] threw:", (e as Error).message)
    }

    return NextResponse.json({
      ok: true,
      deleted_zombies_1h: deletedZombies,
      deleted_old_7d: deletedOld,
    })
  },
)
