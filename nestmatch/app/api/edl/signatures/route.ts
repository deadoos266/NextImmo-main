/**
 * V55.1b — GET /api/edl/signatures?edl_id=X
 *
 * Retourne les signatures EDL (edl_signatures) pour un EDL donné.
 * Server-side avec auth NextAuth + scope check (proprio ou locataire
 * de l'annonce parent uniquement). Préparation REVOKE SELECT anon
 * sur `edl_signatures`.
 *
 * Query : edl_id (string UUID)
 * Réponse : { ok: true, signatures: [...] }
 *
 * Sécurité :
 * - 401 si non authentifié
 * - 403 si l'user n'est ni proprio ni locataire de l'annonce parent
 * - 404 si EDL introuvable
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

  const edlIdRaw = req.nextUrl.searchParams.get("edl_id")
  if (!edlIdRaw || typeof edlIdRaw !== "string") {
    return NextResponse.json({ ok: false, error: "edl_id requis" }, { status: 400 })
  }
  const includePng = req.nextUrl.searchParams.get("include_png") === "true"

  // V55.1b — supporte une liste comma-separated pour batch fetch.
  // Tous les EDLs doivent appartenir à des annonces dont l'user est
  // proprio ou locataire.
  const edlIds = edlIdRaw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 100)
  if (edlIds.length === 0) {
    return NextResponse.json({ ok: false, error: "edl_id requis" }, { status: 400 })
  }

  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin === true

  // Scope check : on récupère les EDLs + leurs annonces parentes pour
  // valider que l'user a accès à chacun. On filtre la liste avant de
  // fetcher les signatures.
  const { data: edls } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("id, annonce_id, email_locataire")
    .in("id", edlIds)
  if (!edls || edls.length === 0) {
    return NextResponse.json({ ok: false, error: "EDL introuvable" }, { status: 404 })
  }

  const annIds = Array.from(new Set(edls.map(e => e.annonce_id).filter(Boolean) as number[]))
  const propEmailByAnnId = new Map<number, string>()
  if (annIds.length > 0) {
    const { data: anns } = await supabaseAdmin
      .from("annonces")
      .select("id, proprietaire_email")
      .in("id", annIds)
    for (const a of (anns || [])) {
      propEmailByAnnId.set((a as { id: number }).id, ((a as { proprietaire_email?: string | null }).proprietaire_email || "").toLowerCase())
    }
  }

  const allowedEdlIds = edls
    .filter(e => {
      if (isAdmin) return true
      const propEmail = e.annonce_id ? (propEmailByAnnId.get(e.annonce_id) || "") : ""
      const locEmail = (e.email_locataire || "").toLowerCase()
      return userEmail === propEmail || userEmail === locEmail
    })
    .map(e => e.id)

  if (allowedEdlIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  const cols = includePng
    ? "edl_id, signataire_role, signataire_nom, signature_png, mention, ip_address, signe_at"
    : "edl_id, signataire_role, signataire_nom, mention, ip_address, signe_at"

  const { data, error } = await supabaseAdmin
    .from("edl_signatures")
    .select(cols)
    .in("edl_id", allowedEdlIds)
  if (error) {
    console.error("[edl/signatures]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, signatures: data ?? [] })
}
