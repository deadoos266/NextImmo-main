/**
 * V97.39.34 — /api/agences/[id]/webhooks/[webhookId]
 *
 * GET    : récupère un webhook (avec le secret en clair — admin uniquement)
 * POST   : send ping de test (envoie un event "test.ping" vers l'URL)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { getUserAgenceContext, hasMinRole } from "@/lib/agences/server"
import { signPayload } from "@/lib/agences/webhooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; webhookId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id, webhookId } = await ctx.params
  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("agence_webhooks")
    .select("*")
    .eq("id", webhookId)
    .eq("agence_id", id)
    .single()
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Webhook introuvable" }, { status: 404 })
  }

  // Fetch les 10 dernières deliveries pour debug
  const { data: deliveries } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("id, event, status, attempt, last_status_code, last_error, created_at, completed_at")
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(10)

  return NextResponse.json({ ok: true, webhook: data, recent_deliveries: deliveries || [] })
}

/**
 * POST = trigger un ping test. Envoie un event "test.ping" en mode synchrone
 * (sans passer par la queue) pour que l'agence puisse vérifier sa config.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; webhookId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id, webhookId } = await ctx.params
  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const { data: webhook } = await supabaseAdmin
    .from("agence_webhooks")
    .select("url, secret")
    .eq("id", webhookId)
    .eq("agence_id", id)
    .single()
  if (!webhook) {
    return NextResponse.json({ ok: false, error: "Webhook introuvable" }, { status: 404 })
  }

  const payload = {
    event: "test.ping",
    timestamp: new Date().toISOString(),
    agence_id: id,
    data: {
      message: "Ceci est un ping de test KeyMatch. Si vous le recevez et que la signature HMAC est valide, votre configuration est OK.",
    },
  }
  const body = JSON.stringify(payload)
  const signature = signPayload(webhook.secret, body)

  let statusCode = 0
  let responseBody = ""
  let error: string | null = null
  const t0 = Date.now()

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "KeyMatch-Webhook/1.0 (test)",
        "X-KeyMatch-Event": "test.ping",
        "X-KeyMatch-Signature": signature,
      },
      body,
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    statusCode = res.status
    responseBody = (await res.text().catch(() => "")).substring(0, 1000)
  } catch (e) {
    error = e instanceof Error ? e.message : "Network error"
  }

  return NextResponse.json({
    ok: statusCode >= 200 && statusCode < 300,
    status_code: statusCode,
    response_body: responseBody,
    error,
    duration_ms: Date.now() - t0,
    signature,
  })
}
