/**
 * V36.6 — /api/recherches-sauvegardees
 *
 * - GET    : liste les recherches de l'user connecté
 * - POST   : crée OU met à jour (upsert sur user_email + name)
 * - DELETE : supprime par id (?id=uuid)
 *
 * Audit V35 R35.5 : avant cette API, les recherches étaient en localStorage.
 * Cross-device cassé. Maintenant : sync Supabase, localStorage = cache local.
 *
 * Auth : NextAuth.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { data, error } = await supabaseAdmin
    .from("recherches_sauvegardees")
    .select("id, name, filtres, created_at, updated_at")
    .eq("user_email", email)
    .order("updated_at", { ascending: false })
  if (error) {
    console.error("[recherches-sauvegardees] GET", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, recherches: data || [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const p = body as { name?: unknown; filtres?: unknown }
  const name = typeof p.name === "string" ? p.name.trim().slice(0, 100) : ""
  const filtres = (p.filtres && typeof p.filtres === "object") ? p.filtres : {}
  if (name.length < 1) {
    return NextResponse.json({ ok: false, error: "Nom requis" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from("recherches_sauvegardees")
    .upsert(
      { user_email: email, name, filtres, updated_at: now },
      { onConflict: "user_email,name" },
    )
    .select("id, name, filtres, created_at, updated_at")
    .single()
  if (error || !data) {
    console.error("[recherches-sauvegardees] POST", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, recherche: data })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const id = req.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from("recherches_sauvegardees")
    .delete()
    .eq("id", id)
    .eq("user_email", email)
  if (error) {
    console.error("[recherches-sauvegardees] DELETE", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
