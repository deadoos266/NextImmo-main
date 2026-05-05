/**
 * V65.2 — GET /api/edl/by-annonces?ids=1,2,3
 *
 * Batch fetch des EDL pour plusieurs annonces (utilisé par /proprietaire
 * dashboard pour afficher les statuts EDL en cards).
 *
 * Retourne un payload léger (annonce_id, type, statut, date_edl, created_at)
 * pour minimiser le transfert réseau.
 *
 * Sécurité :
 *   - NextAuth requis.
 *   - Scope : appelant doit être proprio de toutes les annonces demandées.
 *     Si une seule n'appartient pas au caller → 403 sur la liste entière.
 *
 * Préreq migration 059 (REVOKE SELECT anon sur etats_des_lieux).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const idsRaw = req.nextUrl.searchParams.get("ids") || ""
  const ids = idsRaw
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0)

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, edls: [] })
  }
  if (ids.length > 100) {
    return NextResponse.json({ ok: false, error: "Trop d'ids (max 100)" }, { status: 400 })
  }

  // Scope : toutes les annonces doivent appartenir au caller
  const { data: anns } = await supabaseAdmin
    .from("annonces")
    .select("id, proprietaire_email")
    .in("id", ids)
  const owners = new Set((anns || []).map(a => (a.proprietaire_email || "").toLowerCase()))
  if (owners.size === 0 || (owners.size === 1 && !owners.has(me)) || owners.size > 1) {
    // Si l'une des annonces n'appartient pas au caller, ou si la liste est vide
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("annonce_id, type, statut, date_edl, created_at")
    .in("annonce_id", ids)
  if (error) {
    console.error("[edl/by-annonces]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, edls: data ?? [] })
}
