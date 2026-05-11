import { supabaseAdmin } from "../../../../lib/supabase-server"
import OperationsClient from "./OperationsClient"

/**
 * V84.7 — /admin/operations — Hub observabilité KeyMatch.
 *
 * Regroupe en sections collapsibles :
 *  - Santé services (résumé /admin/health)
 *  - Crons (table cron_logs V84.2 — 50 derniers runs)
 *  - Incidents ouverts (lien /admin/health pour gérer)
 *  - QA Runs (résumé 5 derniers /admin/qa)
 *  - Bug Reports (lien /admin/bugs)
 *
 * Actions globales : Refresh / Re-check health.
 */

export const metadata = {
  title: "Opérations admin — KeyMatch",
  description: "Hub observabilité interne : santé + crons + incidents + QA + bugs.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

async function fetchCronLogs(limit = 50) {
  const { data } = await supabaseAdmin
    .from("cron_logs")
    .select("id, cron_name, cron_path, status, started_at, finished_at, duration_ms, error_message, result_summary")
    .order("started_at", { ascending: false })
    .limit(limit)
  return data || []
}

async function fetchOpenIncidents() {
  const { data } = await supabaseAdmin
    .from("incidents")
    .select("id, title, description, severity, service, status, scope, started_at")
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(10)
  return data || []
}

async function fetchRecentQaRuns() {
  const { data } = await supabaseAdmin
    .from("qa_runs")
    .select("id, scenario_name, status, started_at, duration_ms, steps_passed, steps_total")
    .order("started_at", { ascending: false })
    .limit(5)
  return data || []
}

async function fetchOpenBugs() {
  const { data } = await supabaseAdmin
    .from("user_bug_reports")
    .select("id, description, severity, status, page_url, user_email, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10)
  return data || []
}

export default async function OperationsPage() {
  const [cronLogs, incidents, qaRuns, bugs] = await Promise.all([
    fetchCronLogs(50),
    fetchOpenIncidents(),
    fetchRecentQaRuns(),
    fetchOpenBugs(),
  ])

  return <OperationsClient cronLogs={cronLogs} incidents={incidents} qaRuns={qaRuns} bugs={bugs} />
}
