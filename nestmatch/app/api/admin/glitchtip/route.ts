/**
 * V97.39.34 — GET /api/admin/glitchtip
 *
 * Proxy admin-only vers l'API GlitchTip self-host (sentry.keymatch-immo.fr).
 * Retourne les issues unresolved récentes, formatées pour l'UI admin /admin/erreurs.
 *
 * Auth : session.user.isAdmin REQUIS.
 * Token GlitchTip : GLITCHTIP_API_TOKEN dans /etc/keymatch-prod.env, scopes read-only.
 *
 * Query params :
 *   ?period=24h|7d|30d  (défaut 24h)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GLITCHTIP_BASE = "https://sentry.keymatch-immo.fr/api/0"
const ORG_SLUG = "keymatch"

type GlitchtipIssue = {
  id: string
  title: string
  culprit?: string
  level?: string
  count?: string | number
  userCount?: number
  lastSeen?: string
  firstSeen?: string
  status?: string
  permalink?: string
  shortId?: string
  metadata?: { type?: string; value?: string; filename?: string }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const token = process.env.GLITCHTIP_API_TOKEN
  if (!token) {
    return NextResponse.json({
      ok: false,
      error: "GLITCHTIP_API_TOKEN absent côté serveur. Configuré dans /etc/keymatch-prod.env ?",
    }, { status: 500 })
  }

  const url = new URL(req.url)
  const period = url.searchParams.get("period") || "24h"
  if (!["24h", "7d", "30d", "90d"].includes(period)) {
    return NextResponse.json({ ok: false, error: "period invalide" }, { status: 400 })
  }

  try {
    const res = await fetch(
      `${GLITCHTIP_BASE}/organizations/${ORG_SLUG}/issues/?statsPeriod=${period}&limit=50&query=is:unresolved`,
      {
        headers: { Authorization: `Bearer ${token}` },
        // GlitchTip est self-host sur le même VPS, latency interne — pas besoin de cache
        cache: "no-store",
      },
    )

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `GlitchTip HTTP ${res.status}`,
        detail: await res.text().catch(() => "(no body)"),
      }, { status: 502 })
    }

    const issues = (await res.json()) as GlitchtipIssue[]

    return NextResponse.json({
      ok: true,
      period,
      count: issues.length,
      issues: issues.map(i => ({
        id: i.id,
        shortId: i.shortId,
        title: i.title,
        culprit: i.culprit,
        level: i.level,
        count: Number(i.count) || 0,
        userCount: i.userCount || 0,
        lastSeen: i.lastSeen,
        firstSeen: i.firstSeen,
        status: i.status,
        permalink: i.permalink,
        type: i.metadata?.type,
        value: i.metadata?.value,
        filename: i.metadata?.filename,
      })),
      dashboardUrl: `https://sentry.keymatch-immo.fr/${ORG_SLUG}/keymatch-next/`,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown",
    }, { status: 500 })
  }
}
