import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import CronsAdminClient from "./CronsAdminClient"

export const metadata = {
  title: "Crons admin — KeyMatch",
  description: "Historique d'exécution des crons + déclencheurs manuels.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

// Liste des crons disponibles (cron_path)
const KNOWN_CRONS = [
  { path: "/api/cron/health-check", name: "health-check", schedule: "0 8 * * *", description: "Ping /api/health/full" },
  { path: "/api/cron/loyers-retard", name: "loyers-retard", schedule: "0 8 * * *", description: "Notifs J+5 / J+15 loyers en retard" },
  { path: "/api/cron/depot-retard", name: "depot-retard", schedule: "daily", description: "Rappels dépôt garantie" },
  { path: "/api/cron/messages-digest", name: "messages-digest", schedule: "daily", description: "Digest messages non lus" },
  { path: "/api/cron/candidatures-digest", name: "candidatures-digest", schedule: "daily", description: "Digest candidatures" },
  { path: "/api/cron/visites-rappel", name: "visites-rappel", schedule: "daily", description: "Rappel visites J-1" },
  { path: "/api/cron/preavis-jalons", name: "preavis-jalons", schedule: "daily", description: "Jalons préavis bail" },
  { path: "/api/cron/edl-contestation-retard", name: "edl-contestation-retard", schedule: "daily", description: "Retard contestation EDL" },
  { path: "/api/cron/annonces-stagnantes", name: "annonces-stagnantes", schedule: "weekly", description: "Annonces sans signaux 30j" },
  { path: "/api/cron/post-bail", name: "post-bail", schedule: "daily", description: "Anti-spam post-bail" },
  { path: "/api/cron/db-backup", name: "db-backup", schedule: "daily", description: "Backup DB Supabase" },
  { path: "/api/cron/scrape-irl-insee", name: "scrape-irl-insee", schedule: "monthly", description: "Scrape IRL INSEE" },
  { path: "/api/cron/check-irl", name: "check-irl", schedule: "weekly", description: "Check IRL update" },
  { path: "/api/cron/irl-rappel-bail", name: "irl-rappel-bail", schedule: "daily", description: "Rappels IRL bail" },
  { path: "/api/cron/verify-integrity-baux", name: "verify-integrity-baux", schedule: "weekly", description: "Verif intégrité baux" },
  { path: "/api/cron/qa-daily-run", name: "qa-daily-run", schedule: "0 4 * * *", description: "QA Bot daily run (V83)" },
]

async function fetchLogs() {
  const { data } = await supabaseAdmin
    .from("cron_logs")
    .select("id, cron_name, cron_path, status, started_at, finished_at, duration_ms, error_message, result_summary")
    .order("started_at", { ascending: false })
    .limit(100)
  return data || []
}

async function fetchStats() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from("cron_logs")
    .select("status")
    .gte("started_at", since24h)
  const total = data?.length || 0
  const success = data?.filter(r => r.status === "success").length || 0
  const failure = data?.filter(r => r.status === "failure" || r.status === "timeout").length || 0
  return { total, success, failure }
}

export default async function AdminCronsPage() {
  const [logs, stats] = await Promise.all([fetchLogs(), fetchStats()])

  return (
    <div>
      <AdminPageHeader
        title="Crons"
        subtitle={`${stats.total} exécutions 24h · ${stats.success} OK · ${stats.failure} fail · ${KNOWN_CRONS.length} crons définis`}
      />
      <CronsAdminClient knownCrons={KNOWN_CRONS} logs={logs} />
    </div>
  )
}
