/**
 * V97.24 — /api/admin/releases (GET list + POST create)
 *
 * Système de validation des commits par Paul (admin).
 * Cf. migration 079 + PHASE_3_ROADMAP futur P3-Admin.
 *
 * POST : crée une row release_validations à partir d'un sha + checklist.
 *        Utilisé par moi (Claude) à chaque commit important — j'envoie
 *        depuis le repo local OU une UI admin manuelle.
 *
 * GET  : liste paginée (50 max) triée par created_at DESC, filtre status optionnel.
 *
 * Auth : admin only (NextAuth user.isAdmin true).
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
  // V97.32 — `coded` = fait par Claude, à tester. `ok` = validé Paul.
  status?: "pending" | "coded" | "ok" | "blocked"
  note?: string | null
  screenshot_path?: string | null
}

interface CreateBody {
  commit_sha: string
  commit_short?: string
  commit_title: string
  commit_body?: string
  checks: string[] | CheckItem[]
}

function isAdminSession(session: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(session && (session as any).user?.isAdmin === true)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdminSession(session)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const status = req.nextUrl.searchParams.get("status")
  let query = supabaseAdmin
    .from("release_validations")
    .select("id, commit_sha, commit_short, commit_title, status, checks, created_at, updated_at, validated_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (status && ["pending", "in_progress", "validated", "blocked"].includes(status)) {
    query = query.eq("status", status)
  }

  const { data, error } = await query
  if (error) {
    console.error("[admin/releases GET]", error)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }

  // Stats par status pour le badge sidebar
  const { data: statsRows } = await supabaseAdmin
    .from("release_validations")
    .select("status")
  const stats: Record<string, number> = { pending: 0, in_progress: 0, validated: 0, blocked: 0 }
  for (const r of statsRows || []) {
    if (r.status in stats) stats[r.status] = (stats[r.status] || 0) + 1
  }

  return NextResponse.json({ ok: true, releases: data || [], stats })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdminSession(session)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  let body: CreateBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const commit_sha = typeof body.commit_sha === "string" ? body.commit_sha.trim() : ""
  const commit_title = typeof body.commit_title === "string" ? body.commit_title.trim().slice(0, 500) : ""
  if (!/^[a-f0-9]{7,64}$/i.test(commit_sha)) {
    return NextResponse.json({ ok: false, error: "commit_sha invalide" }, { status: 400 })
  }
  if (commit_title.length < 3) {
    return NextResponse.json({ ok: false, error: "commit_title trop court" }, { status: 400 })
  }

  // Normalise les checks : accepte string[] ou CheckItem[]
  const rawChecks = Array.isArray(body.checks) ? body.checks : []
  const checks: CheckItem[] = rawChecks.slice(0, 50).map((c, idx): CheckItem => {
    if (typeof c === "string") {
      // V97.32 — Default `coded` (fait par Claude) au lieu de `pending`
      return { id: `check-${idx + 1}`, label: c.slice(0, 300), status: "coded" as const }
    }
    const status: CheckItem["status"] = (c.status === "ok" || c.status === "blocked" || c.status === "coded" || c.status === "pending") ? c.status : "coded"
    return {
      id: typeof c.id === "string" ? c.id.slice(0, 50) : `check-${idx + 1}`,
      label: typeof c.label === "string" ? c.label.slice(0, 300) : "",
      status,
      note: typeof c.note === "string" ? c.note.slice(0, 500) : null,
      screenshot_path: typeof c.screenshot_path === "string" ? c.screenshot_path.slice(0, 300) : null,
    }
  }).filter(c => c.label.length > 0)

  const { data, error } = await supabaseAdmin
    .from("release_validations")
    .insert({
      commit_sha,
      commit_short: typeof body.commit_short === "string" ? body.commit_short.slice(0, 20) : commit_sha.slice(0, 8),
      commit_title,
      commit_body: typeof body.commit_body === "string" ? body.commit_body.slice(0, 5000) : null,
      checks,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) {
    // Si conflit unique sur commit_sha, l'entry existe déjà
    if (error.code === "23505") {
      return NextResponse.json({ ok: false, error: "Ce commit a déjà une release_validation", duplicate: true }, { status: 409 })
    }
    console.error("[admin/releases POST]", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
