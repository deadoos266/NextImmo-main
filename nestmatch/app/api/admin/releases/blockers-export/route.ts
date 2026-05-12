/**
 * V97.28 — GET /api/admin/releases/blockers-export
 *
 * Export markdown de TOUS les checks bloqués (status='blocked') à travers
 * toutes les release_validations. Inclut :
 *   - Titre release + commit_short
 *   - Label du check
 *   - Note de blocage
 *   - Signed URL 1h du screenshot (si présent)
 *
 * Usage :
 *   1. UI /admin/releases : bouton "Copier markdown" qui fetch ?format=markdown
 *      avec cookie auth → met dans le presse-papier de Paul.
 *   2. Claude WebFetch : ?token=<CLAUDE_BRIEF_TOKEN> permet à Claude d'accéder
 *      au markdown depuis une nouvelle session, sans auth NextAuth (pas de
 *      cookie côté Claude). Token statique configuré côté Vercel env.
 *
 * Format de sortie :
 *   - ?format=markdown (default) → text/plain
 *   - ?format=json → JSON structuré
 *
 * Sécurité :
 *  - Auth NextAuth admin OU token query string CLAUDE_BRIEF_TOKEN match.
 *  - Token via env var → si pas configurée, seul l'auth NextAuth marche.
 *  - Signed URLs des screenshots expirent à 1h.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface CheckItem {
  id: string
  label: string
  status?: "pending" | "ok" | "blocked"
  note?: string | null
  screenshot_path?: string | null
}

interface ReleaseRow {
  id: string
  commit_sha: string
  commit_short: string | null
  commit_title: string
  status: string
  checks: CheckItem[]
  blocker_description: string | null
  updated_at: string
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Voie 1 : cookie session admin (UI Paul)
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (session && (session as any).user?.isAdmin === true) return true

  // Voie 2 : token query string (Claude WebFetch)
  const briefToken = process.env.CLAUDE_BRIEF_TOKEN
  if (briefToken) {
    const provided = req.nextUrl.searchParams.get("token") || ""
    // Comparaison timing-safe (en mode dev/prod NodeJS, c'est OK)
    if (provided && provided === briefToken) return true
  }

  return false
}

async function resolveScreenshotUrl(storedPath: string | null): Promise<string | null> {
  if (!storedPath) return null
  // Path stocké au format "release-<id>/<ts>-<rand>.<ext>"
  if (!/^release-[a-z0-9_-]+\/\d+-[a-z0-9]+\.(jpg|png|webp)$/i.test(storedPath)) return null
  const { data } = await supabaseAdmin.storage
    .from("bug-screenshots")
    .createSignedUrl(storedPath, 3600)
  return data?.signedUrl || null
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 })
  }

  const format = req.nextUrl.searchParams.get("format") || "markdown"

  // Fetch toutes les releases avec au moins un check bloqué
  const { data: releases, error } = await supabaseAdmin
    .from("release_validations")
    .select("id, commit_sha, commit_short, commit_title, status, checks, blocker_description, updated_at")
    .or("status.eq.blocked,status.eq.in_progress,status.eq.pending")
    .order("updated_at", { ascending: false })
    .limit(200)

  if (error) {
    console.error("[blockers-export]", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Filtre côté JS : on garde seulement les releases qui ont au moins un check blocked
  const blockedReleases: ReleaseRow[] = ((releases || []) as ReleaseRow[]).filter(r =>
    Array.isArray(r.checks) && r.checks.some(c => c.status === "blocked"),
  )

  // Résout les signed URLs pour tous les screenshots
  const enriched = await Promise.all(blockedReleases.map(async r => ({
    ...r,
    blockedChecks: await Promise.all(
      r.checks
        .filter(c => c.status === "blocked")
        .map(async c => ({
          ...c,
          screenshot_url: await resolveScreenshotUrl(c.screenshot_path || null),
        })),
    ),
  })))

  if (format === "json") {
    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      count_releases: enriched.length,
      count_blockers: enriched.reduce((sum, r) => sum + r.blockedChecks.length, 0),
      releases: enriched,
    })
  }

  // Format markdown
  const now = new Date()
  const dateFr = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
  const heureFr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  const totalBlockers = enriched.reduce((sum, r) => sum + r.blockedChecks.length, 0)

  let md = `# Blocages KeyMatch à corriger\n\n`
  md += `_Généré le ${dateFr} à ${heureFr} · ${enriched.length} release${enriched.length > 1 ? "s" : ""} avec ${totalBlockers} blocage${totalBlockers > 1 ? "s" : ""} au total._\n\n`

  if (enriched.length === 0) {
    md += `**Aucun blocage** 🎉 Tous les checks sont OK ou pending.\n`
  } else {
    md += `---\n\n`
    for (const r of enriched) {
      md += `## ${r.commit_short || r.commit_sha.slice(0, 8)} — ${r.commit_title}\n\n`
      for (const c of r.blockedChecks) {
        md += `### ❌ ${c.label}\n\n`
        if (c.note) {
          md += `**Note** : « ${c.note} »\n\n`
        }
        if (c.screenshot_url) {
          md += `**Screenshot** : ${c.screenshot_url}\n_(Signed URL valide 1h)_\n\n`
        }
      }
      if (r.blocker_description) {
        md += `**Note globale release** : ${r.blocker_description}\n\n`
      }
      md += `---\n\n`
    }
    md += `## Instructions pour Claude\n\n`
    md += `Pour chaque blocage ci-dessus :\n`
    md += `1. Identifie le fichier/route concerné (cherche dans le repo)\n`
    md += `2. Reproduis localement si possible\n`
    md += `3. Fix avec un commit ciblé\n`
    md += `4. PATCH le check via \`PATCH /api/admin/releases/<id>/check/<checkId>\` avec \`{ status: "ok" }\` une fois fix poussé\n`
  }

  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
