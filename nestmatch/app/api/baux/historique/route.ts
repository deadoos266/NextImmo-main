/**
 * V57.6 — GET /api/baux/historique
 *
 * Retourne la liste des baux clos pour l'user authentifié, du plus
 * récent au plus ancien.
 *
 * Côté proprio : tous les baux dont user.email = proprietaire_email.
 * Côté locataire : tous les baux dont user.email = locataire_email.
 *
 * Auth : NextAuth obligatoire.
 *
 * Query : ?as=proprio|locataire (default = auto via session,
 *         locataire si pas proprio actif)
 *
 * Réponse : { ok: true, baux: HistoriqueBaux[] }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const asParam = req.nextUrl.searchParams.get("as")
  const as: "proprio" | "locataire" = asParam === "locataire" ? "locataire" : "proprio"

  const col = as === "proprio" ? "proprietaire_email" : "locataire_email"

  const { data, error } = await supabaseAdmin
    .from("historique_baux")
    .select("id, annonce_id, proprietaire_email, locataire_email, date_debut_bail, date_fin_bail, bail_termine_at, bien_titre, bien_ville, bien_adresse, loyer_hc, charges, caution, depot_restitue_at, depot_montant_restitue, depot_montant_retenu, depot_motifs_retenue, total_loyers_percus, bail_pdf_url, edl_entree_id, edl_sortie_id, fin_motif, fin_motif_detail, created_at")
    .eq(col, userEmail)
    .order("bail_termine_at", { ascending: false })
  if (error) {
    console.error("[baux/historique]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, baux: data ?? [] })
}
