/**
 * V87.6 — GET / POST / DELETE /api/admin/emails/suppress
 *
 * Gestion de la suppress list (emails bounce/complaint qu'on ne contacte plus).
 *
 * GET    : liste les emails suppressed
 * POST   : ajout manuel ({ email, reason_detail? })
 * DELETE : retire de la suppress list (réactive l'email)
 *
 * Auth admin strict.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }
  const { data, error } = await supabaseAdmin
    .from("email_suppress_list")
    .select("email, reason, reason_detail, added_at, added_by, removed_at, removed_by")
    .order("added_at", { ascending: false })
    .limit(200)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, suppressed: data || [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin || !session.user.email) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const reason_detail = typeof body.reason_detail === "string" ? body.reason_detail.slice(0, 500) : "Ajouté manuellement par admin"
  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from("email_suppress_list")
    .upsert({
      email,
      reason: "manual",
      reason_detail,
      added_by: session.user.email,
      removed_at: null,
      removed_by: null,
    }, { onConflict: "email" })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin || !session.user.email) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }
  const url = new URL(req.url)
  const email = (url.searchParams.get("email") || "").trim().toLowerCase()
  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from("email_suppress_list")
    .update({ removed_at: new Date().toISOString(), removed_by: session.user.email })
    .eq("email", email)
    .is("removed_at", null)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
