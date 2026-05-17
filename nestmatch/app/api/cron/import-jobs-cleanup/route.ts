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
    const errors: string[] = []

    // Zombies : pending/processing > 1h
    try {
      const { error, count } = await supabaseAdmin
        .from("import_jobs")
        .delete({ count: "exact" })
        .in("status", ["pending", "processing"])
        .lt("created_at", oneHourAgo)
      if (error) {
        const msg = `zombies delete failed: ${error.message}`
        console.warn("[cron cleanup]", msg)
        errors.push(msg)
      } else {
        deletedZombies = count || 0
      }
    } catch (e) {
      const msg = `zombies delete threw: ${(e as Error).message}`
      console.warn("[cron cleanup]", msg)
      errors.push(msg)
    }

    // Anciens : done/failed > 7j
    try {
      const { error, count } = await supabaseAdmin
        .from("import_jobs")
        .delete({ count: "exact" })
        .in("status", ["done", "failed"])
        .lt("created_at", sevenDaysAgo)
      if (error) {
        const msg = `old delete failed: ${error.message}`
        console.warn("[cron cleanup]", msg)
        errors.push(msg)
      } else {
        deletedOld = count || 0
      }
    } catch (e) {
      const msg = `old delete threw: ${(e as Error).message}`
      console.warn("[cron cleanup]", msg)
      errors.push(msg)
    }

    // V97.39.8 — si les 2 DELETE ont foiré, retourne 500 pour visibilité dans cron_logs
    // (sinon withCronLogging logue 200 et on perd l'info que rien n'a marché)
    const allFailed = errors.length >= 2
    return NextResponse.json(
      {
        ok: !allFailed,
        deleted_zombies_1h: deletedZombies,
        deleted_old_7d: deletedOld,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: allFailed ? 500 : 200 },
    )
  },
)
