/**
 * DELETE /api/admin/annonces/[id]
 *
 * Admin-only. Supprime une annonce et nettoie toutes les lignes dépendantes
 * en service_role (bypass RLS, bypass silent-fails du client anon).
 *
 * Protection : session NextAuth + flag is_admin vérifié côté serveur.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  // Vérifier flag admin en DB
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("is_admin")
    .eq("email", email)
    .single()

  if (userErr || !user?.is_admin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "ID invalide" }, { status: 400 })
  }

  // Nettoyage en cascade — on avale les erreurs individuelles des tables
  // qui n'existent peut-être pas encore (setup local), mais on log.
  const idStr = String(id)
  const cleanups = await Promise.allSettled([
    supabaseAdmin.from("visites").delete().eq("annonce_id", id),
    supabaseAdmin.from("messages").delete().eq("annonce_id", id),
    supabaseAdmin.from("carnet_entretien").delete().eq("annonce_id", id),
    supabaseAdmin.from("loyers").delete().eq("annonce_id", id),
    supabaseAdmin.from("etats_des_lieux").delete().eq("annonce_id", id),
    supabaseAdmin.from("clics_annonces").delete().eq("annonce_id", id),
    supabaseAdmin.from("signalements").delete().eq("type", "annonce").eq("target_id", idStr),
  ])

  const failures = cleanups
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any)?.error))
  if (failures.length > 0) {
    console.warn(`[admin/annonces DELETE] cleanup warnings for annonce ${id}:`, failures.map(f => f.i))
  }

  // Enfin, l'annonce elle-même
  const { error: delErr } = await supabaseAdmin.from("annonces").delete().eq("id", id)
  if (delErr) {
    console.error(`[admin/annonces DELETE] échec suppression annonce ${id}:`, delErr)
    return NextResponse.json(
      { success: false, error: `Suppression échouée : ${delErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
