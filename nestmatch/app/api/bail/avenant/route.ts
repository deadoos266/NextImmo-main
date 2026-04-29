/**
 * V34.7 — POST /api/bail/avenant
 * Crée une demande d'avenant (modification post-signature) sur un bail actif.
 *
 * Body : {
 *   annonceId: number,
 *   type: "ajout_colocataire" | "retrait_colocataire" | "modif_loyer"
 *       | "modif_charges" | "ajout_garant" | "retrait_garant"
 *       | "modif_clause" | "autre",
 *   titre: string,
 *   description?: string,
 *   nouveauxChamps?: Record<string, unknown>  // delta proposé
 * }
 *
 * Side-effects :
 * - Insert row bail_avenants (statut "propose").
 * - Insert message [AVENANT_PROPOSE] dans le thread.
 * - Notif cloche à l'autre partie.
 *
 * V34.7 = version minimale (proposition + thread). V35 = re-signature
 * partielle + génération PDF.
 *
 * Auth : NextAuth + match locataire OU proprio.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

const TYPES_VALIDES = [
  "ajout_colocataire", "retrait_colocataire",
  "modif_loyer", "modif_charges",
  "ajout_garant", "retrait_garant",
  "modif_clause", "autre",
]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const p = body as {
    annonceId?: unknown
    type?: unknown
    titre?: unknown
    description?: unknown
    nouveauxChamps?: unknown
  }
  const annonceId = Number(p.annonceId)
  const type = typeof p.type === "string" ? p.type : ""
  const titre = typeof p.titre === "string" ? p.titre.trim().slice(0, 200) : ""
  const description = typeof p.description === "string" ? p.description.trim().slice(0, 2000) : ""
  const nouveauxChamps = (p.nouveauxChamps && typeof p.nouveauxChamps === "object") ? p.nouveauxChamps : null

  if (!Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  if (!TYPES_VALIDES.includes(type)) {
    return NextResponse.json({ ok: false, error: "type invalide" }, { status: 400 })
  }
  if (titre.length < 5) {
    return NextResponse.json({ ok: false, error: "titre trop court (min 5 chars)" }, { status: 400 })
  }

  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, proprietaire_email, locataire_email, bail_signe_locataire_at")
    .eq("id", annonceId)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  const isProprio = userEmail === propEmail
  const isLocataire = userEmail === locEmail
  if (!isProprio && !isLocataire) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }
  if (!annonce.bail_signe_locataire_at) {
    return NextResponse.json({ ok: false, error: "Bail pas encore signé — pas d'avenant possible" }, { status: 400 })
  }

  // Calcule le numéro d'avenant suivant
  const { data: existants } = await supabaseAdmin
    .from("bail_avenants")
    .select("numero")
    .eq("annonce_id", annonceId)
    .order("numero", { ascending: false })
    .limit(1)
  const numero = existants && existants.length > 0 ? Number(existants[0].numero) + 1 : 1

  const now = new Date().toISOString()
  const { data: avenant, error: insErr } = await supabaseAdmin
    .from("bail_avenants")
    .insert({
      annonce_id: annonceId,
      numero,
      type,
      titre,
      description: description || null,
      nouveau_payload: nouveauxChamps,
      statut: "propose",
      propose_par_email: userEmail,
      created_at: now,
    })
    .select("id, numero")
    .single()
  if (insErr || !avenant) {
    console.error("[bail/avenant] insert failed", insErr)
    return NextResponse.json({ ok: false, error: "Création avenant échouée" }, { status: 500 })
  }

  // Notif + message à l'autre partie
  const autre = isProprio ? locEmail : propEmail
  if (autre) {
    const payload = JSON.stringify({
      avenantId: avenant.id,
      numero,
      type,
      titre,
      description,
      proposeParRole: isProprio ? "proprietaire" : "locataire",
      annonceId,
    })
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: autre,
      contenu: `[AVENANT_PROPOSE]${payload}`,
      lu: false,
      annonce_id: annonceId,
      created_at: now,
    }])
    await supabaseAdmin.from("notifications").insert([{
      user_email: autre,
      type: "avenant_propose",
      title: `Avenant N°${numero} proposé`,
      body: `${titre}. Cliquez pour voir la proposition de modification.`,
      href: isProprio ? "/mon-logement" : `/proprietaire/bail/${annonceId}`,
      related_id: String(annonceId),
      lu: false,
      created_at: now,
    }])
  }

  return NextResponse.json({ ok: true, avenantId: avenant.id, numero })
}

/**
 * GET /api/bail/avenant?annonceId=N
 * Liste les avenants pour une annonce. Auth : proprio OU locataire.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const annonceIdRaw = req.nextUrl.searchParams.get("annonceId")
  const annonceId = Number(annonceIdRaw)
  if (!Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }

  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email, locataire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  if (
    (annonce.proprietaire_email || "").toLowerCase() !== userEmail &&
    (annonce.locataire_email || "").toLowerCase() !== userEmail
  ) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }

  const { data: avenants } = await supabaseAdmin
    .from("bail_avenants")
    .select("id, numero, type, titre, description, statut, propose_par_email, signe_locataire_at, signe_bailleur_at, created_at")
    .eq("annonce_id", annonceId)
    .order("numero", { ascending: false })

  return NextResponse.json({ ok: true, avenants: avenants || [] })
}
