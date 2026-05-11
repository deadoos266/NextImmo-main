/**
 * V84.8 / V97.10 / V97.11 — POST /api/bugs/report
 *
 * V84.8 : endpoint manuel pour le bouton 🐛 (authenticated requis)
 * V97.10 : ajout screenshot_url (Supabase Storage)
 * V97.11 : accepte les anonymes pour auto-report sur 404 (vital car
 *          80% des 404 viennent de visiteurs non connectés : crawlers,
 *          liens partagés cassés). Rate-limit IP strict. Scrub PII auto
 *          (emails + tokens dans la description).
 *
 * Body : {
 *   description: string (required, min 5 chars)
 *   severity: 'critical' | 'major' | 'minor' | 'cosmetic'
 *   page_url: string
 *   user_agent?: string
 *   console_log?: array
 *   network_log?: array
 *   screenshot_url?: string
 * }
 *
 * Auth :
 *  - Si user connecté → user_email rempli depuis session
 *  - Si anonyme → user_email = null, user_role = 'anonymous', rate-limit IP plus strict
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_SEVERITIES = ["critical", "major", "minor", "cosmetic"] as const

/**
 * V97.11 — Scrub PII pour limiter le leak dans /admin/bugs.
 * Remplace emails et tokens query-string par des placeholders.
 * Volontairement large (mieux vaut over-scrubber qu'under-).
 */
function scrubPII(text: string): string {
  return text
    // emails → [email]
    .replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[email]")
    // ?token=... &token=... ?api_key=... &access_token=... → token=[redacted]
    .replace(/([?&](?:token|api[_-]?key|access[_-]?token|secret|password|pwd|auth)=)[^&\s]+/gi, "$1[redacted]")
    // Bearer xxx → Bearer [redacted]
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    // Numéros de cartes 16 chiffres (basique)
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[card]")
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email || null
  const isAnonymous = !userEmail

  // V97.11 — Rate-limit IP plus strict pour anonymes (10 par jour) que
  // pour authentifiés (50 par heure). Permet aux auto-reports 404 de
  // visiteurs de remonter sans qu'un bot puisse remplir la table.
  const ip = getClientIp(req.headers)
  const rlKey = isAnonymous ? `bugs-report:anon:${ip}` : `bugs-report:auth:${userEmail}`
  const rlConfig = isAnonymous
    ? { max: 10, windowMs: 24 * 60 * 60 * 1000 }   // 10/jour anonymes
    : { max: 50, windowMs: 60 * 60 * 1000 }         // 50/h authentifiés
  const rl = await checkRateLimitAsync(rlKey, rlConfig)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de signalements, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  const body = await req.json().catch(() => ({}))
  const descriptionRaw = typeof body.description === "string" ? body.description.trim() : ""
  const description = scrubPII(descriptionRaw)  // V97.11
  const severity = typeof body.severity === "string" && (ALLOWED_SEVERITIES as readonly string[]).includes(body.severity)
    ? body.severity : "minor"
  const page_urlRaw = typeof body.page_url === "string" ? body.page_url.slice(0, 500) : ""
  const page_url = scrubPII(page_urlRaw)  // V97.11 — URLs peuvent contenir des tokens
  const user_agent = typeof body.user_agent === "string" ? body.user_agent.slice(0, 300) : null
  const console_log = Array.isArray(body.console_log) ? body.console_log.slice(0, 50) : null
  const network_log = Array.isArray(body.network_log) ? body.network_log.slice(0, 20) : null
  const screenshot_url = typeof body.screenshot_url === "string" ? body.screenshot_url.slice(0, 500) : null

  if (description.length < 5) {
    return NextResponse.json({ ok: false, error: "Description trop courte (min 5 caractères)" }, { status: 400 })
  }
  if (!page_url) {
    return NextResponse.json({ ok: false, error: "page_url requis" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("user_bug_reports")
    .insert({
      user_email: userEmail,
      // V97.11 — Identifie d'où vient le report dans /admin/bugs
      user_role: isAnonymous ? "anonymous" : (session?.user?.role || null),
      page_url,
      user_agent,
      description: description.slice(0, 2000),
      severity,
      status: "open",
      screenshot_url,
      console_log,
      network_log,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[bugs/report] insert failed:", error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
