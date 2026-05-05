/**
 * V65.1 — DELETE + PATCH /api/messages/:id
 *
 * Permet à l'expéditeur d'un message de :
 *   - DELETE : supprimer son message (soft-delete via DELETE strict, on
 *     vérifie from_email = session avant).
 *   - PATCH : éditer le contenu (window 5 min après envoi, modifs au-delà
 *     refusées pour préserver l'intégrité conversationnelle).
 *
 * Préreq migration 058 (REVOKE UPDATE/DELETE anon sur messages).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

const EDIT_WINDOW_MS = 5 * 60 * 1000

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await params
  const messageId = Number(id)
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return NextResponse.json({ ok: false, error: "id invalide" }, { status: 400 })
  }

  // Lookup pour vérifier ownership
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("from_email")
    .eq("id", messageId)
    .maybeSingle()
  if (!msg) {
    return NextResponse.json({ ok: false, error: "Message introuvable" }, { status: 404 })
  }
  if ((msg.from_email || "").toLowerCase() !== me) {
    return NextResponse.json({ ok: false, error: "Vous ne pouvez supprimer que vos propres messages" }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from("messages")
    .delete()
    .eq("id", messageId)
  if (error) {
    console.error("[messages DELETE]", error)
    return NextResponse.json({ ok: false, error: "Suppression échouée" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

interface PatchBody {
  contenu?: string
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await params
  const messageId = Number(id)
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return NextResponse.json({ ok: false, error: "id invalide" }, { status: 400 })
  }

  let body: PatchBody
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const contenu = typeof body.contenu === "string" ? body.contenu.trim().slice(0, 4000) : ""
  if (contenu.length < 1) {
    return NextResponse.json({ ok: false, error: "Contenu vide" }, { status: 400 })
  }

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("from_email, created_at")
    .eq("id", messageId)
    .maybeSingle()
  if (!msg) {
    return NextResponse.json({ ok: false, error: "Message introuvable" }, { status: 404 })
  }
  if ((msg.from_email || "").toLowerCase() !== me) {
    return NextResponse.json({ ok: false, error: "Vous ne pouvez éditer que vos propres messages" }, { status: 403 })
  }
  // Window 5 min — préserve l'intégrité conversationnelle
  const ageMs = Date.now() - new Date(msg.created_at).getTime()
  if (ageMs > EDIT_WINDOW_MS) {
    return NextResponse.json({ ok: false, error: "Édition impossible après 5 minutes" }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from("messages")
    .update({ contenu })
    .eq("id", messageId)
  if (error) {
    console.error("[messages PATCH]", error)
    return NextResponse.json({ ok: false, error: "Update échoué" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
