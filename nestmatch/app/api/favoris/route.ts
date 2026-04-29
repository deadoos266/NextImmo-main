/**
 * V43 — /api/favoris
 *
 * - GET    : liste des annonce_id favoris de l'user connecté.
 * - POST   : ajoute un favori { annonceId }.
 * - DELETE : retire un favori (?annonceId=N).
 *
 * Auth : NextAuth + supabaseAdmin (RLS lockdown migration 046).
 * Pas de leak cross-user : tout est scopé par session.user.email.
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
    .from("favoris")
    .select("annonce_id")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[favoris] GET", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  const ids = (data || []).map(r => r.annonce_id).filter((n): n is number => Number.isFinite(n))
  return NextResponse.json({ ok: true, favoris: ids })
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
  const annonceId = Number((body as { annonceId?: unknown }).annonceId)
  if (!Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  // Upsert (UNIQUE constraint user_email + annonce_id) — idempotent si on
  // ajoute 2× le même favori en double-tap.
  const { error } = await supabaseAdmin
    .from("favoris")
    .upsert({ user_email: email, annonce_id: annonceId }, { onConflict: "user_email,annonce_id" })
  if (error) {
    console.error("[favoris] POST", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const annonceId = Number(req.nextUrl.searchParams.get("annonceId"))
  if (!Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from("favoris")
    .delete()
    .eq("user_email", email)
    .eq("annonce_id", annonceId)
  if (error) {
    console.error("[favoris] DELETE", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
