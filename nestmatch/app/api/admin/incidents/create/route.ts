/**
 * V71.4 — POST /api/admin/incidents/create
 *
 * Crée un incident manuel (typiquement pour annoncer une maintenance
 * planifiée à l'avance, ou un incident détecté manuellement par l'admin).
 *
 * Body : { title, description?, severity, status?, service, is_public? }
 *   - severity ∈ { 'info', 'minor', 'major', 'critical' }
 *   - status   ∈ { 'investigating', 'identified', 'monitoring', 'resolved' } (default 'investigating')
 *   - service  ∈ { 'database', 'auth', 'email', 'storage', 'crons', 'app' }
 *   - is_public ∈ boolean (default false — visible /admin/health uniquement)
 *
 * Auth : NextAuth + session.user.isAdmin = true. Sinon 403.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_SEVERITY = new Set(["info", "minor", "major", "critical"])
const ALLOWED_STATUS = new Set(["investigating", "identified", "monitoring", "resolved"])
const ALLOWED_SERVICE = new Set(["database", "auth", "email", "storage", "crons", "app"])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalide" }, { status: 400 })
  }

  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description = typeof body.description === "string" ? body.description.trim() : null
  const severity = typeof body.severity === "string" ? body.severity : ""
  const status = typeof body.status === "string" ? body.status : "investigating"
  const service = typeof body.service === "string" ? body.service : ""
  const isPublic = body.is_public === true

  if (!title || title.length > 200) {
    return NextResponse.json({ success: false, error: "Titre obligatoire (≤200 chars)" }, { status: 400 })
  }
  if (!ALLOWED_SEVERITY.has(severity)) {
    return NextResponse.json({ success: false, error: `Severity invalide` }, { status: 400 })
  }
  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ success: false, error: `Status invalide` }, { status: 400 })
  }
  if (!ALLOWED_SERVICE.has(service)) {
    return NextResponse.json({ success: false, error: `Service invalide` }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("incidents")
    .insert({ title, description, severity, status, service, is_public: isPublic })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data?.id }, { status: 201 })
}
