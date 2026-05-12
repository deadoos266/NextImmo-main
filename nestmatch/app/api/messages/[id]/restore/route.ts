/**
 * V97.26 T1 — POST /api/messages/[id]/restore
 *
 * Restaure un message soft-deleted (set deleted_at = NULL).
 * Permet l'undo après suppression (window 5s côté UI).
 *
 * Auth : seul l'expéditeur (from_email = session) peut restaurer.
 * Window : pour éviter qu'un user restore un message d'il y a 1 mois
 * et perturbe une conv ancienne, on limite à 5 minutes après deleted_at.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

const RESTORE_WINDOW_MS = 5 * 60 * 1000

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("from_email, deleted_at")
    .eq("id", messageId)
    .maybeSingle()
  if (!msg) {
    return NextResponse.json({ ok: false, error: "Message introuvable" }, { status: 404 })
  }
  if ((msg.from_email || "").toLowerCase() !== me) {
    return NextResponse.json({ ok: false, error: "Restauration interdite" }, { status: 403 })
  }
  if (!msg.deleted_at) {
    return NextResponse.json({ ok: false, error: "Ce message n'est pas supprimé" }, { status: 409 })
  }
  // Window 5 min : empêche de restaurer un message ancien
  const ageMs = Date.now() - new Date(msg.deleted_at).getTime()
  if (ageMs > RESTORE_WINDOW_MS) {
    return NextResponse.json({ ok: false, error: "Restauration impossible après 5 minutes" }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from("messages")
    .update({ deleted_at: null })
    .eq("id", messageId)
  if (error) {
    console.error("[messages restore]", error)
    return NextResponse.json({ ok: false, error: "Restauration échouée" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
