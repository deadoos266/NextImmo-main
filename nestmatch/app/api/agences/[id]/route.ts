/**
 * V97.39.34 — GET + PATCH /api/agences/[id]
 *
 * GET   : retourne les détails complets d'une agence (membres + annonces count).
 *         Doit être member actif au moins viewer.
 * PATCH : update logo_url, couleur_primaire, bio, telephone (settings agence).
 *         Doit être role admin+.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { getUserAgenceContext, hasMinRole } from "@/lib/agences/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "ID invalide" }, { status: 400 })
  }

  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "viewer")) {
    return NextResponse.json({ ok: false, error: "Vous n'êtes pas membre de cette agence" }, { status: 403 })
  }

  const { data: agence } = await supabaseAdmin
    .from("agences")
    .select("*")
    .eq("id", id)
    .single()
  if (!agence) {
    return NextResponse.json({ ok: false, error: "Agence introuvable" }, { status: 404 })
  }

  const { data: membres } = await supabaseAdmin
    .from("agence_membres")
    .select("id, user_email, role, invited_at, joined_at, invited_by")
    .eq("agence_id", id)
    .is("removed_at", null)
    .order("invited_at", { ascending: false })

  const { count: nbAnnonces } = await supabaseAdmin
    .from("annonces")
    .select("id", { count: "exact", head: true })
    .eq("agence_id", id)

  return NextResponse.json({
    ok: true,
    agence,
    membres: membres || [],
    nbAnnonces: nbAnnonces || 0,
    currentUserRole: uctx?.role,
  })
}

interface PatchBody {
  logo_url?: string | null
  couleur_primaire?: string | null
  bio?: string | null
  telephone?: string | null
  adresse?: string
  code_postal?: string | null
  ville?: string | null
  email?: string
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
  if (!body) {
    return NextResponse.json({ ok: false, error: "Body invalide" }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.logo_url !== undefined) update.logo_url = body.logo_url
  if (body.couleur_primaire !== undefined) {
    if (body.couleur_primaire && !/^#[0-9a-fA-F]{6}$/.test(body.couleur_primaire)) {
      return NextResponse.json({ ok: false, error: "Couleur primaire invalide (format #RRGGBB)" }, { status: 400 })
    }
    update.couleur_primaire = body.couleur_primaire
  }
  if (body.bio !== undefined) update.bio = body.bio?.substring(0, 500) || null
  if (body.telephone !== undefined) update.telephone = body.telephone
  if (body.adresse !== undefined && body.adresse) update.adresse = body.adresse
  if (body.code_postal !== undefined) update.code_postal = body.code_postal
  if (body.ville !== undefined) update.ville = body.ville
  if (body.email !== undefined && body.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 })
    }
    update.email = body.email.toLowerCase()
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun champ à mettre à jour" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("agences")
    .update(update)
    .eq("id", id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
