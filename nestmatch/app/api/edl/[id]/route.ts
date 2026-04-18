/**
 * GET /api/edl/[id]
 *
 * Charge un état des lieux via service_role et vérifie côté serveur que
 * l'utilisateur connecté est bien le locataire ou le propriétaire concerné.
 * Remplace l'accès direct client → Supabase (qui dépendait d'une RLS absente).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const { id } = await params
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "État des lieux introuvable" }, { status: 404 })
  }

  const locEmail = (data.email_locataire || data.locataire_email || "").toLowerCase()
  const propEmail = (data.proprietaire_email || "").toLowerCase()
  const { data: userRow } = await supabaseAdmin.from("users").select("is_admin").eq("email", email).single()
  const isAdmin = userRow?.is_admin === true

  if (!isAdmin && email !== locEmail && email !== propEmail) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Optionnel — joindre les infos annonce basiques pour éviter un 2e round-trip
  let bien: { titre?: string; ville?: string; adresse?: string; surface?: number } | null = null
  if (data.annonce_id) {
    const { data: bienData } = await supabaseAdmin
      .from("annonces")
      .select("titre, ville, adresse, surface")
      .eq("id", data.annonce_id)
      .single()
    if (bienData) bien = bienData
  }

  return NextResponse.json({ edl: data, bien })
}
