/**
 * V57.5 — POST /api/baux/relouer
 *
 * Le proprio termine définitivement un bail (locataire parti, EDL sortie
 * validée, dépôt restitué) ET republie l'annonce en 1 click pour
 * relocation immédiate.
 *
 * Effets :
 *   1. Crée une row dans `historique_baux` avec snapshot complet du bail
 *      (loyer, dates, dépôt restitué, montants retenus, URLs PDF).
 *   2. Reset annonces.statut = 'disponible' + locataire_email NULL +
 *      date_debut_bail NULL + bail_genere_at/signe_*_at NULL +
 *      preavis_* NULL + depot_* NULL.
 *   3. Garde photos, description, prix, criteres candidats — l'annonce
 *      reste pertinente pour relocation.
 *   4. Insert dans profils.anciens_logements (côté locataire).
 *
 * Sécurité : NextAuth + match proprietaire_email.
 *
 * Idempotence : si déjà existe une historique_baux pour cette annonce
 * + bail_termine_at récent (< 24h), retourne OK silencieusement.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

interface Body {
  annonceId?: number | string
  finMotif?: "preavis_locataire" | "preavis_bailleur" | "fin_terme" | "accord_amiable"
  finMotifDetail?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const annonceId = Number(body.annonceId)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  const finMotif = body.finMotif || "accord_amiable"
  const finMotifDetail = (body.finMotifDetail || "").trim().slice(0, 500)

  // Récupère l'annonce + verify ownership
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, adresse, prix, charges, caution, proprietaire_email, locataire_email, date_debut_bail, depot_restitue_at, depot_montant_retenu, depot_motifs_retenue, bail_termine_at, statut")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (ann.proprietaire_email || "").toLowerCase()
  if (propEmail !== userEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }

  const locEmail = (ann.locataire_email || "").toLowerCase()
  if (!locEmail) {
    return NextResponse.json({ ok: false, error: "Pas de locataire actif sur cette annonce" }, { status: 400 })
  }

  // Idempotence : si déjà archivé récemment, return OK
  const { data: existingArchive } = await supabaseAdmin
    .from("historique_baux")
    .select("id, bail_termine_at")
    .eq("annonce_id", annonceId)
    .eq("locataire_email", locEmail)
    .order("bail_termine_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingArchive) {
    const archiveAge = Date.now() - new Date(existingArchive.bail_termine_at).getTime()
    if (archiveAge < 24 * 3600 * 1000) {
      return NextResponse.json({ ok: true, alreadyArchived: true, historiqueId: existingArchive.id })
    }
  }

  // Calcul total loyers perçus pour ce bail (= confirmés depuis date_debut_bail)
  let totalLoyers = 0
  if (ann.date_debut_bail) {
    const { data: loyers } = await supabaseAdmin
      .from("loyers")
      .select("montant, charges, statut, mois")
      .eq("annonce_id", annonceId)
      .eq("statut", "confirmé")
      .gte("mois", String(ann.date_debut_bail).slice(0, 7))
    if (loyers) {
      totalLoyers = loyers.reduce((acc, l) => acc + Number(l.montant || 0) + Number(l.charges || 0), 0)
    }
  }

  // Récupère les EDL liés (entrée + sortie)
  const { data: edls } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("id, type, statut")
    .eq("annonce_id", annonceId)
    .eq("statut", "valide")
  const edlEntreeId = edls?.find(e => e.type === "entree")?.id ?? null
  const edlSortieId = edls?.find(e => e.type === "sortie")?.id ?? null

  // Récupère le bail PDF URL depuis le dernier message [BAIL_FINAL_PDF]
  let bailPdfUrl: string | null = null
  try {
    const { data: bailMsg } = await supabaseAdmin
      .from("messages")
      .select("contenu")
      .eq("annonce_id", annonceId)
      .ilike("contenu", "[BAIL_FINAL_PDF]%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (bailMsg?.contenu) {
      const payload = JSON.parse(bailMsg.contenu.slice("[BAIL_FINAL_PDF]".length))
      bailPdfUrl = payload?.url || null
    }
  } catch { /* ignore */ }

  const nowIso = new Date().toISOString()
  const depotMontantRestitue = Number(ann.caution || 0) - Number(ann.depot_montant_retenu || 0)

  // 1. Insert historique_baux
  const { data: histo, error: histErr } = await supabaseAdmin
    .from("historique_baux")
    .insert({
      annonce_id: annonceId,
      proprietaire_email: propEmail,
      locataire_email: locEmail,
      date_debut_bail: ann.date_debut_bail || null,
      date_fin_bail: nowIso.slice(0, 10),
      bail_termine_at: nowIso,
      bien_titre: ann.titre,
      bien_ville: ann.ville,
      bien_adresse: ann.adresse,
      loyer_hc: ann.prix,
      charges: ann.charges,
      caution: ann.caution,
      depot_restitue_at: ann.depot_restitue_at,
      depot_montant_restitue: ann.depot_restitue_at ? depotMontantRestitue : null,
      depot_montant_retenu: ann.depot_montant_retenu || 0,
      depot_motifs_retenue: ann.depot_motifs_retenue || [],
      total_loyers_percus: totalLoyers,
      bail_pdf_url: bailPdfUrl,
      edl_entree_id: edlEntreeId,
      edl_sortie_id: edlSortieId,
      fin_motif: finMotif,
      fin_motif_detail: finMotifDetail || null,
    })
    .select("id")
    .single()
  if (histErr) {
    console.error("[baux/relouer] historique insert failed", histErr)
    return NextResponse.json({ ok: false, error: "Archive bail échouée" }, { status: 500 })
  }

  // 2. Reset annonce — disponible pour relocation
  const { error: resetErr } = await supabaseAdmin
    .from("annonces")
    .update({
      statut: "disponible",
      locataire_email: null,
      locataire_email_at_end: locEmail,
      bail_termine_at: nowIso,
      date_debut_bail: null,
      bail_genere_at: null,
      bail_signe_locataire_at: null,
      bail_signe_bailleur_at: null,
      bail_relance_at: null,
      bail_relance_locataire_at: null,
      preavis_donne_par: null,
      preavis_date_envoi: null,
      preavis_motif: null,
      preavis_motif_detail: null,
      preavis_date_depart_souhaitee: null,
      preavis_fin_calculee: null,
      depot_restitue_at: null,
      depot_montant_retenu: 0,
      depot_motifs_retenue: [],
      auto_paiement_actif: false,
    })
    .eq("id", annonceId)
  if (resetErr) {
    console.error("[baux/relouer] reset failed", resetErr)
    return NextResponse.json({ ok: false, error: "Reset annonce échoué" }, { status: 500 })
  }

  // 3. Insert dans profils.anciens_logements (locataire)
  try {
    const { data: locProf } = await supabaseAdmin
      .from("profils")
      .select("anciens_logements")
      .eq("email", locEmail)
      .maybeSingle()
    const cur = Array.isArray(locProf?.anciens_logements) ? locProf.anciens_logements : []
    const next = [
      ...cur,
      {
        annonce_id: annonceId,
        bail_termine_at: nowIso,
        titre: ann.titre,
        ville: ann.ville,
      },
    ]
    await supabaseAdmin
      .from("profils")
      .update({ anciens_logements: next })
      .eq("email", locEmail)
  } catch (e) {
    console.warn("[baux/relouer] anciens_logements update failed:", e)
  }

  return NextResponse.json({
    ok: true,
    historiqueId: histo.id,
    annonceId,
    statut: "disponible",
  })
}
