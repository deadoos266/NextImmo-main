/**
 * V84.10 — withCronLogging : wrapper qui log automatiquement chaque
 * exécution de cron dans la table cron_logs (V84.2).
 *
 * Usage :
 *   export const GET = withCronLogging("loyers-retard", async (req) => {
 *     // ... handler existant ...
 *     return NextResponse.json({ ok: true, rows_processed: 12 });
 *   });
 *
 * Effets :
 *  - INSERT row status='started' au début (timestamp)
 *  - UPDATE row à la fin avec status, duration_ms, error_message,
 *    result_summary (extrait du JSON response si possible)
 *  - Si exception non-catchée → status='failure' + error_message
 *
 * Aucun impact sur la logique métier — wrapper transparent.
 */

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

type CronHandler = (req: NextRequest) => Promise<Response> | Response

export function withCronLogging(name: string, schedule: string | null, handler: CronHandler): CronHandler {
  return async function wrappedCron(req: NextRequest) {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()
    let logId: number | null = null

    // INSERT row "started" (best-effort, on continue même si fail)
    try {
      const { data } = await supabaseAdmin
        .from("cron_logs")
        .insert({
          cron_path: new URL(req.url).pathname,
          cron_name: name,
          schedule,
          status: "started",
          started_at: startedAt,
        })
        .select("id")
        .single()
      logId = data?.id ?? null
    } catch (e) {
      console.warn(`[cron-log] insert started failed for ${name}:`, e)
    }

    try {
      const response = await handler(req)
      const duration_ms = Date.now() - t0

      // Tente de parser le JSON response pour extraire un result_summary
      let result_summary: Record<string, unknown> | null = null
      let success = response.ok
      try {
        const clone = response.clone()
        const data = await clone.json()
        // Heuristique : si la response contient { ok: true/false }
        if (typeof data === "object" && data !== null) {
          success = data.ok !== false
          result_summary = data
        }
      } catch { /* response pas JSON, on garde ok status HTTP */ }

      if (logId !== null) {
        try {
          await supabaseAdmin
            .from("cron_logs")
            .update({
              status: success ? "success" : "failure",
              finished_at: new Date().toISOString(),
              duration_ms,
              result_summary,
              error_message: success ? null : `HTTP ${response.status}`,
            })
            .eq("id", logId)
        } catch (e) {
          console.warn(`[cron-log] update success failed for ${name}:`, e)
        }
      }
      return response
    } catch (err) {
      const duration_ms = Date.now() - t0
      const error_message = err instanceof Error ? err.message : String(err)
      if (logId !== null) {
        try {
          await supabaseAdmin
            .from("cron_logs")
            .update({
              status: "failure",
              finished_at: new Date().toISOString(),
              duration_ms,
              error_message: error_message.slice(0, 1000),
            })
            .eq("id", logId)
        } catch (e) {
          console.warn(`[cron-log] update failure failed for ${name}:`, e)
        }
      }
      // Re-throw pour préserver le comportement original
      throw err
    }
  }
}

/**
 * Helper : utilise withCronLogging sans schedule (sera lu depuis vercel.json
 * mais on n'a pas accès au runtime).
 */
export function logCron(name: string, handler: CronHandler): CronHandler {
  return withCronLogging(name, null, handler)
}

/**
 * Helper pour wrapper rapidement un handler en gardant la signature exacte.
 */
export { NextResponse }
