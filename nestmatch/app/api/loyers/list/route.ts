/**
 * V65.2 — GET /api/loyers/list
 *
 * Endpoint unifié pour lire les loyers selon le scope demandé.
 *
 * Modes (query params) :
 *   ?annonce_id=X            : loyers d'une annonce spécifique (proprio OU
 *                              locataire de cette annonce)
 *   ?mine=locataire          : tous mes loyers en tant que locataire
 *                              (filter loyers.locataire_email = me)
 *   ?mine=proprio            : tous les loyers de mes biens en tant que proprio
 *                              (filter loyers.proprietaire_email = me)
 *   &with_quittance=true     : ajoute filter quittance_pdf_url IS NOT NULL
 *
 * Sécurité :
 *   - NextAuth requis. me = session.email strictement.
 *   - Mode `annonce_id` : check proprio ou locataire de l'annonce.
 *   - Mode `mine=*` : filter direct sur email session.
 *
 * Préreq migration 059 (REVOKE SELECT anon sur loyers).
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

  const annonceIdRaw = req.nextUrl.searchParams.get("annonce_id")
  const mine = req.nextUrl.searchParams.get("mine")
  const withQuittance = req.nextUrl.searchParams.get("with_quittance") === "true"

  // Mode annonce spécifique
  if (annonceIdRaw) {
    const annonceId = Number(annonceIdRaw)
    if (!Number.isFinite(annonceId) || annonceId <= 0) {
      return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
    }
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
    let q = supabaseAdmin
      .from("loyers")
      .select("*")
      .eq("annonce_id", annonceId)
      .order("mois", { ascending: false })
    if (withQuittance) q = q.not("quittance_pdf_url", "is", null)
    const { data, error } = await q
    if (error) {
      console.error("[loyers/list annonce_id]", error)
      return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, loyers: data ?? [] })
  }

  // Mode "mine"
  if (mine === "locataire" || mine === "proprio") {
    const col = mine === "locataire" ? "locataire_email" : "proprietaire_email"
    let q = supabaseAdmin
      .from("loyers")
      .select(withQuittance ? "id, annonce_id, mois, quittance_pdf_url" : "*")
      .eq(col, me)
      .order("id", { ascending: false })
    if (withQuittance) q = q.not("quittance_pdf_url", "is", null)
    const { data, error } = await q
    if (error) {
      console.error("[loyers/list mine]", error)
      return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, loyers: data ?? [] })
  }

  return NextResponse.json({ ok: false, error: "Mode invalide (annonce_id ou mine=...)" }, { status: 400 })
}
