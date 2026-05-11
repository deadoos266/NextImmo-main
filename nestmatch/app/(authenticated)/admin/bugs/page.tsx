import { supabaseAdmin } from "../../../../lib/supabase-server"
import BugsAdminClient from "./BugsAdminClient"

/**
 * V84.8 — /admin/bugs — Gestion bug reports.
 *
 * Layout admin V84.4 fournit déjà sidebar + breadcrumb.
 * Cette page : filtres + table + modal détail.
 */

export const metadata = {
  title: "Bug reports admin — KeyMatch",
  description: "Gestion des signalements bug utilisateurs.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

async function fetchInitialBugs() {
  const { data } = await supabaseAdmin
    .from("user_bug_reports")
    .select("id, user_email, user_role, page_url, description, severity, status, screenshot_url, notes, fixed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
  return data || []
}

async function fetchStats() {
  const { data } = await supabaseAdmin
    .from("user_bug_reports")
    .select("severity, status")
  const bySeverity: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const b of data || []) {
    bySeverity[b.severity] = (bySeverity[b.severity] || 0) + 1
    byStatus[b.status] = (byStatus[b.status] || 0) + 1
  }
  return { by_severity: bySeverity, by_status: byStatus, total: data?.length || 0 }
}

export default async function BugsPage() {
  const [bugs, stats] = await Promise.all([fetchInitialBugs(), fetchStats()])
  return <BugsAdminClient initialBugs={bugs} initialStats={stats} />
}
