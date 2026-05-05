/**
 * V65.2 — GET /api/edl/by-annonce?annonce_id=X[&type=entree|sortie][&statut=valide]
 *
 * Retourne le dernier EDL d'une annonce, optionnellement filtré par type
 * (entree/sortie) ou par statut.
 *
 * Si `?fields=pieces_data` : retourne uniquement le champ pieces_data du
 * dernier EDL de type entree avec statut=valide. Utilisé pour cloner
 * les pièces de l'EDL d'entrée vers l'EDL de sortie (proprietaire/edl).
 *
 * Sécurité :
 *   - NextAuth requis.
 *   - Scope : appelant doit être proprio OU locataire de l'annonce.
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

  const annonceId = Number(req.nextUrl.searchParams.get("annonce_id"))
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
  }

  // Scope : proprio OU locataire
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email, locataire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  if ((ann.proprietaire_email || "").toLowerCase() !== me && (ann.locataire_email || "").toLowerCase() !== me) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  const type = req.nextUrl.searchParams.get("type") // "entree" | "sortie" | null
  const statut = req.nextUrl.searchParams.get("statut") // "valide" | null
  const fields = req.nextUrl.searchParams.get("fields") // "pieces_data" | null

  let q = supabaseAdmin
    .from("etats_des_lieux")
    .select(fields === "pieces_data" ? "pieces_data" : "*")
    .eq("annonce_id", annonceId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (type === "entree" || type === "sortie") q = q.eq("type", type)
  if (statut === "valide") q = q.eq("statut", "valide")

  const { data, error } = await q.maybeSingle()
  if (error) {
    console.error("[edl/by-annonce]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, edl: data ?? null })
}
