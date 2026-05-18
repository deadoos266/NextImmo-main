/**
 * V97.39.34 — Gestion des clés API d'une agence (dashboard interne).
 *
 * GET    : liste les clés (sans révéler key complète, juste prefix + meta)
 * POST   : génère une nouvelle clé. Retourne la clé COMPLÈTE 1× (affichée
 *          ensuite "******" dans la liste).
 * DELETE : révoque une clé (set revoked_at).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { getUserAgenceContext, hasMinRole } from "@/lib/agences/server"
import { generateApiKey } from "@/lib/agences/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PostBody {
  label: string
  scopes?: string[]
}

interface DeleteBody {
  key_id: string
}

const VALID_SCOPES = [
  "annonces:read",
  "annonces:write",
  "candidatures:read",
  "members:read",
]

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
    .from("agence_api_keys")
    .select("id, label, key_prefix, scopes, created_by, created_at, last_used_at, last_used_ip, revoked_at, revoked_by")
    .eq("agence_id", id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, keys: data || [] })
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
  if (!body?.label || body.label.length < 3) {
    return NextResponse.json({ ok: false, error: "Label requis (3+ chars)" }, { status: 400 })
  }

  let scopes = body.scopes && body.scopes.length > 0 ? body.scopes : ["annonces:read", "annonces:write", "candidatures:read"]
  scopes = scopes.filter(s => VALID_SCOPES.includes(s))
  if (scopes.length === 0) {
    return NextResponse.json({ ok: false, error: "Au moins un scope valide requis" }, { status: 400 })
  }

  const { fullKey, keyPrefix, keyHash } = await generateApiKey()

  const { data: created, error } = await supabaseAdmin
    .from("agence_api_keys")
    .insert({
      agence_id: id,
      label: body.label.substring(0, 100),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      created_by: session.user.email.toLowerCase(),
    })
    .select("id, key_prefix, label, scopes, created_at")
    .single()

  if (error || !created) {
    return NextResponse.json({ ok: false, error: error?.message || "insert error" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    key: created,
    // ⚠ La clé complète est retournée UNE SEULE FOIS, à afficher au user.
    // Elle ne sera plus jamais récupérable ensuite.
    full_key: fullKey,
    notice: "Copiez cette clé maintenant. Elle ne sera plus jamais affichée. Si vous la perdez, vous devrez en générer une nouvelle.",
  })
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
  if (!body?.key_id) {
    return NextResponse.json({ ok: false, error: "key_id requis" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("agence_api_keys")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: session.user.email.toLowerCase(),
    })
    .eq("id", body.key_id)
    .eq("agence_id", id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
