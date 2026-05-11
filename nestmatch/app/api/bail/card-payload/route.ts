/**
 * V65.1 — GET /api/bail/card-payload?annonce_id=X
 *
 * Retourne le contenu du dernier message [BAIL_CARD] pour une annonce.
 * Utilisé par /mon-logement et /proprietaire/bail/[id] pour reconstruire
 * le payload du bail (téléchargement PDF).
 *
 * Sécurité :
 *   - NextAuth requis.
 *   - Scope check : appelant doit être proprio OU locataire de l'annonce.
 *   - 403 si l'appelant n'a pas accès.
 *
 * Préreq migration 058 (REVOKE SELECT anon sur messages).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const annonceId = Number(req.nextUrl.searchParams.get("annonce_id"))
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
  }

  // Scope : appelant = proprio OU locataire de l'annonce
  // V89.2 — On charge aussi les champs nécessaires au fallback "bail importé"
  // (cf audit V88 : sans ce fallback, /mon-logement n'affiche jamais le PDF
  // importé car aucun message [BAIL_CARD] n'est créé à l'acceptance).
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email, locataire_email, bail_source, bail_pdf_url, titre, ville, adresse, prix, charges, surface, pieces, meuble, date_debut_bail, import_metadata")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (ann.proprietaire_email || "").toLowerCase()
  const locEmail = (ann.locataire_email || "").toLowerCase()
  if (email !== propEmail && email !== locEmail) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("contenu, created_at")
    .eq("annonce_id", annonceId)
    .ilike("contenu", "[BAIL_CARD]%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (msg) {
    // Strip the prefix [BAIL_CARD] et parse JSON pour le retourner directement.
    const raw = (msg.contenu as string).slice("[BAIL_CARD]".length)
    let payload: unknown = null
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }
    return NextResponse.json({ ok: true, payload, createdAt: msg.created_at })
  }

  // V89.2 — Fallback bail importé : pas de [BAIL_CARD] mais on synthétise un
  // payload minimal à partir des colonnes annonces + import_metadata pour que
  // /mon-logement puisse afficher "Mon bail" + bouton download PDF.
  if (ann.bail_source && String(ann.bail_source).startsWith("imported")) {
    const meta = (ann.import_metadata as Record<string, unknown> | null) || {}
    const importedPayload = {
      _imported: true,  // flag UI : pas de "Signer le bail", juste download
      fichierUrl: ann.bail_pdf_url || null,
      titreBien: ann.titre || "",
      villeBien: ann.ville || "",
      adresseBien: ann.adresse || "",
      surface: ann.surface || meta.surface || null,
      pieces: ann.pieces || meta.pieces || null,
      meuble: ann.meuble ?? meta.meuble ?? false,
      loyerHC: Number(ann.prix) || 0,
      charges: Number(ann.charges) || 0,
      dateDebut: ann.date_debut_bail || meta.date_debut || null,
      dateSignature: meta.date_signature || null,
      duree: meta.duree_mois || 36,
      depotGarantie: meta.depot_garantie || 0,
    }
    return NextResponse.json({ ok: true, payload: importedPayload, createdAt: null })
  }

  return NextResponse.json({ ok: true, payload: null })
}
