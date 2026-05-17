import { supabaseAdmin } from "../../../../lib/supabase-server"
import BugsAdminClient from "./BugsAdminClient"
import { storage } from "@/lib/storage"

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

/**
 * V97.10 — Génère une signed URL pour les screenshots stockés en bucket privé.
 * Format stocké : `storage://bug-screenshots/<filename>` (V97.10 BugReportButton).
 * Fallback : si le format n'est pas reconnu (anciens reports avec URL directe),
 * on retourne tel quel.
 */
async function resolveScreenshotUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null
  const STORAGE_PREFIX = "storage://bug-screenshots/"
  if (!stored.startsWith(STORAGE_PREFIX)) return stored
  const path = stored.slice(STORAGE_PREFIX.length)
  // Signed URL valide 1h — admin peut re-rafraîchir en rechargeant la page
  const { data } = await storage.from("bug-screenshots").createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

async function fetchInitialBugs() {
  const { data } = await supabaseAdmin
    .from("user_bug_reports")
    .select("id, user_email, user_role, page_url, description, severity, status, screenshot_url, console_log, network_log, notes, fixed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
  if (!data) return []
  // V97.10 — Resolve signed URLs en parallèle pour les bugs avec screenshot
  return Promise.all(data.map(async b => ({
    ...b,
    screenshot_url: await resolveScreenshotUrl(b.screenshot_url),
  })))
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
