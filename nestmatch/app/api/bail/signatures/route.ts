/**
 * V55.1b — GET /api/bail/signatures?annonce_id=X
 *
 * Retourne les signatures du bail (bail_signatures) pour une annonce donnée.
 * Server-side avec auth NextAuth + scope check (proprio ou locataire de
 * l'annonce uniquement). Préparation REVOKE SELECT anon sur `bail_signatures`.
 *
 * Query params :
 *  - annonce_id (number)        — requis
 *  - include_png (bool, default false) — si true, retourne signature_png
 *    (lourd, ~50-100KB par sig). Sinon retourne juste les métadonnées.
 *
 * Réponse : { ok: true, signatures: [...] }
 *
 * Sécurité :
 * - 401 si non authentifié
 * - 403 si l'user n'est ni proprio ni locataire de l'annonce
 * - 404 si annonce introuvable
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

  const annonceIdRaw = req.nextUrl.searchParams.get("annonce_id")
  const annonceId = Number(annonceIdRaw)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
  }
  const includePng = req.nextUrl.searchParams.get("include_png") === "true"

  // Scope check : l'user doit être proprio OU locataire de l'annonce.
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("id, proprietaire_email, locataire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin === true
  const propEmail = (ann.proprietaire_email || "").toLowerCase()
  const locEmail = (ann.locataire_email || "").toLowerCase()
  if (!isAdmin && userEmail !== propEmail && userEmail !== locEmail) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  // Whitelist des colonnes — signature_png seulement sur demande explicite
  // pour éviter de balayer des kilo-octets inutilement.
  const cols = includePng
    ? "signataire_role, signataire_nom, signature_png, mention, ip_address, signe_at"
    : "signataire_role, signataire_nom, mention, ip_address, signe_at"

  const { data, error } = await supabaseAdmin
    .from("bail_signatures")
    .select(cols)
    .eq("annonce_id", annonceId)
  if (error) {
    console.error("[bail/signatures]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, signatures: data ?? [] })
}
