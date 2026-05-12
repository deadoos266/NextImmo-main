import { supabaseAdmin } from "../../../../lib/supabase-server"
import ReleasesAdminClient from "./ReleasesAdminClient"

/**
 * V97.24 — /admin/releases — Validation manuelle des commits par Paul.
 *
 * À chaque commit important, je crée une row release_validations avec une
 * checklist. Paul vient ici, lit le diff, et coche chaque check (validated/
 * blocked + photo + description).
 *
 * Layout admin fournit sidebar + breadcrumb.
 */

export const metadata = {
  title: "Validations release — KeyMatch admin",
  description: "Validation manuelle des commits par checklist (V97.24+).",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

interface CheckItem {
  id: string
  label: string
  status?: "pending" | "ok" | "blocked"
  note?: string | null
  screenshot_path?: string | null
}

export interface ReleaseRow {
  id: string
  commit_sha: string
  commit_short: string | null
  commit_title: string
  commit_body: string | null
  checks: CheckItem[]
  status: "pending" | "in_progress" | "validated" | "blocked"
  blocker_description: string | null
  blocker_screenshot_path: string | null
  created_at: string
  updated_at: string
  validated_at: string | null
  validated_by: string | null
}

async function fetchInitialReleases(): Promise<{ releases: ReleaseRow[]; stats: Record<string, number> }> {
  const { data } = await supabaseAdmin
    .from("release_validations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  const { data: statsRows } = await supabaseAdmin
    .from("release_validations")
    .select("status")

  const stats: Record<string, number> = { pending: 0, in_progress: 0, validated: 0, blocked: 0 }
  for (const r of statsRows || []) {
    if (r.status in stats) stats[r.status] = (stats[r.status] || 0) + 1
  }

  return { releases: (data || []) as ReleaseRow[], stats }
}

export default async function ReleasesPage() {
  const { releases, stats } = await fetchInitialReleases()
  return <ReleasesAdminClient initialReleases={releases} initialStats={stats} />
}
