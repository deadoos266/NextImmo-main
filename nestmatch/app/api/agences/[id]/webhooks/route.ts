/**
 * V97.39.34 — CRUD webhooks d'une agence (interface admin agence).
 *
 * GET    : liste les webhooks configurés
 * POST   : crée un webhook (URL + events souscrits, secret généré auto)
 * DELETE : supprime un webhook
 *
 * Auth : role admin+ requis (session NextAuth).
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { getUserAgenceContext, hasMinRole } from "@/lib/agences/server"
import { WEBHOOK_EVENTS } from "@/lib/agences/webhooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PostBody {
  url: string
  events: string[]
  label?: string
}

interface DeleteBody {
  webhook_id: string
}

interface PatchBody {
  webhook_id: string
  active?: boolean
  events?: string[]
  url?: string
  label?: string
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params
  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("agence_webhooks")
    .select("id, url, events, active, label, created_by, created_at, updated_at, total_deliveries, total_failures, last_delivered_at, last_failed_at, last_status")
    .eq("agence_id", id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, webhooks: data || [], available_events: WEBHOOK_EVENTS })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params
  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as PostBody | null
  if (!body?.url || !body?.events) {
    return NextResponse.json({ ok: false, error: "url et events requis" }, { status: 400 })
  }
  if (!body.url.startsWith("https://")) {
    return NextResponse.json({ ok: false, error: "URL doit commencer par https:// (TLS obligatoire)" }, { status: 400 })
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ ok: false, error: "Au moins un event requis" }, { status: 400 })
  }
  const invalidEvents = body.events.filter(e => !(WEBHOOK_EVENTS as readonly string[]).includes(e))
  if (invalidEvents.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Events inconnus : ${invalidEvents.join(", ")}. Liste valide : ${WEBHOOK_EVENTS.join(", ")}`,
    }, { status: 400 })
  }

  // Génère un secret HMAC de 32 bytes hex (256 bits)
  const secret = crypto.randomBytes(32).toString("hex")

  const { data, error } = await supabaseAdmin
    .from("agence_webhooks")
    .insert({
      agence_id: id,
      url: body.url,
      secret,
      events: body.events,
      label: body.label?.substring(0, 100) || null,
      created_by: session.user.email.toLowerCase(),
    })
    .select("id, url, events, label, created_at")
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || "Erreur insert" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    webhook: data,
    secret,  // Retourné UNE FOIS — à afficher au user qui doit le copier
    notice: "Notez ce secret maintenant. Il sera utilisé pour vérifier la signature des webhooks reçus. Vous pouvez le réafficher plus tard si besoin (contrairement aux clés API).",
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params
  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (!body?.webhook_id) {
    return NextResponse.json({ ok: false, error: "webhook_id requis" }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.active !== undefined) update.active = !!body.active
  if (body.events !== undefined) {
    if (!Array.isArray(body.events)) {
      return NextResponse.json({ ok: false, error: "events doit être array" }, { status: 400 })
    }
    const invalid = body.events.filter(e => !(WEBHOOK_EVENTS as readonly string[]).includes(e))
    if (invalid.length > 0) {
      return NextResponse.json({ ok: false, error: `Events inconnus : ${invalid.join(", ")}` }, { status: 400 })
    }
    update.events = body.events
  }
  if (body.url !== undefined) {
    if (!body.url.startsWith("https://")) {
      return NextResponse.json({ ok: false, error: "URL doit commencer par https://" }, { status: 400 })
    }
    update.url = body.url
  }
  if (body.label !== undefined) update.label = body.label?.substring(0, 100) || null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun champ à updater" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("agence_webhooks")
    .update(update)
    .eq("id", body.webhook_id)
    .eq("agence_id", id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params
  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as DeleteBody | null
  if (!body?.webhook_id) {
    return NextResponse.json({ ok: false, error: "webhook_id requis" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("agence_webhooks")
    .delete()
    .eq("id", body.webhook_id)
    .eq("agence_id", id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
