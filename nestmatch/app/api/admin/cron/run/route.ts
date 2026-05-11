/**
 * POST /api/admin/cron/run
 *
 * Proxy admin pour déclencher manuellement un cron protégé par CRON_SECRET.
 * Le bouton "Lancer maintenant" sur /admin/crons appelle cet endpoint, qui :
 *   1. Vérifie l'auth admin (NextAuth + isAdmin)
 *   2. Récupère CRON_SECRET côté serveur (env)
 *   3. Fait un fetch interne avec Authorization: Bearer CRON_SECRET
 *   4. Retourne le résultat du cron
 *
 * Body : { path: "/api/cron/xxx" }
 * Sécurité : path doit matcher /^\/api\/cron\/[a-z0-9-]+$/ (anti-SSRF).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_PATH_RE = /^\/api\/cron\/[a-z0-9-]+$/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  let body: { path?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const path = typeof body.path === "string" ? body.path.trim() : ""
  if (!ALLOWED_PATH_RE.test(path)) {
    return NextResponse.json({ ok: false, error: "Path invalide" }, { status: 400 })
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET manquant côté serveur" },
      { status: 500 }
    )
  }

  // Base URL pour le fetch interne (Vercel expose VERCEL_URL ; en dev = req.url).
  const baseUrl =
    process.env.NEXT_PUBLIC_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    new URL(req.url).origin

  const t0 = Date.now()
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    })
    const text = await res.text().catch(() => "")
    let json: unknown = null
    try { json = JSON.parse(text) } catch { /* texte brut */ }
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      duration_ms: Date.now() - t0,
      result: json ?? text.slice(0, 500),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - t0,
    }, { status: 500 })
  }
}
