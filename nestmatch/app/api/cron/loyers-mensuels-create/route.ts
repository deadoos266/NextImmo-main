/**
 * V94 — GET /api/cron/loyers-mensuels-create
 *
 * Le 1er de chaque mois à 6h, crée une row `loyers` (statut "déclaré") pour
 * chaque bail actif qui n'a pas encore de loyer pour le mois courant.
 *
 * Why : sans ce cron, le proprio doit déclarer manuellement le loyer chaque
 * mois pour chaque locataire (et /mes-quittances reste vide côté locataire
 * tant que rien n'est confirmé). Avec ce cron :
 *  - Le 1er du mois, row "déclaré" créée pour chaque bail
 *  - Le proprio voit sur /proprietaire "Loyer du mois en attente" → 1 click
 *    pour confirmer → quittance PDF générée + email envoyé au locataire
 *  - Le cron `loyers-retard` (déjà existant) checke après J+10 si la row
 *    est restée en "déclaré" et envoie un rappel au locataire
 *
 * Bail actif = annonce avec `statut = 'loué'` ET `locataire_email` non null
 * ET (bail_source != null OU bail_signe_locataire_at + bail_signe_bailleur_at).
 *
 * Anti-doublon : skip les annonces qui ont déjà un loyer pour le mois courant.
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withCronLogging("loyers-mensuels-create", "0 6 1 * *", async function cronGET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (process.env.NODE_ENV === "production" && (!cronSecret || auth !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const t0 = Date.now()
  const today = new Date()
  const moisCourant = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`

  // 1. Récupère tous les baux actifs : statut = "loué" + locataire_email présent
  const { data: baux, error: bauxErr } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, prix, charges, proprietaire_email, locataire_email, bail_source, bail_signe_locataire_at, bail_signe_bailleur_at, date_debut_bail")
    .eq("statut", "loué")
    .not("locataire_email", "is", null)
    .limit(5000)

  if (bauxErr) {
    console.error("[loyers-mensuels-create] fetch baux failed", bauxErr)
    return NextResponse.json({ ok: false, error: bauxErr.message }, { status: 500 })
  }

  if (!baux || baux.length === 0) {
    return NextResponse.json({
      ok: true,
      mois_courant: moisCourant,
      baux_actifs: 0,
      loyers_crees: 0,
      duration_ms: Date.now() - t0,
    })
  }

  // 2. Filtre : on garde seulement les baux qui sont effectivement actifs
  // (soit bail_source posé pour les imports, soit double signature KeyMatch)
  const bauxActifs = baux.filter(b => {
    const hasImported = !!b.bail_source && String(b.bail_source).startsWith("imported")
    const hasSignatures = !!b.bail_signe_locataire_at && !!b.bail_signe_bailleur_at
    return hasImported || hasSignatures
  })

  if (bauxActifs.length === 0) {
    return NextResponse.json({
      ok: true,
      mois_courant: moisCourant,
      baux_total: baux.length,
      baux_actifs: 0,
      loyers_crees: 0,
      duration_ms: Date.now() - t0,
      note: "Aucun bail actif (manque bail_signe_* ou bail_source).",
    })
  }

  // 3. Vérifie quels baux ont DÉJÀ un loyer pour le mois courant
  const annonceIds = bauxActifs.map(b => b.id)
  const { data: existingLoyers } = await supabaseAdmin
    .from("loyers")
    .select("annonce_id")
    .in("annonce_id", annonceIds)
    .eq("mois", moisCourant)
  const dejaTraites = new Set((existingLoyers || []).map(l => l.annonce_id))

  // 4. Filtre + prépare insert pour les baux qui n'ont PAS encore de loyer ce mois
  const toCreate = bauxActifs.filter(b => !dejaTraites.has(b.id))
  if (toCreate.length === 0) {
    return NextResponse.json({
      ok: true,
      mois_courant: moisCourant,
      baux_actifs: bauxActifs.length,
      loyers_crees: 0,
      duration_ms: Date.now() - t0,
      note: "Tous les baux ont déjà leur loyer pour ce mois.",
    })
  }

  // 5. Garde-fou : si date_debut_bail > moisCourant (bail futur), skip
  const moisCourantDate = new Date(today.getFullYear(), today.getMonth(), 1)
  const insertRows = toCreate
    .filter(b => {
      if (!b.date_debut_bail) return true  // pas de date → on crée par défaut
      try {
        const d = new Date(b.date_debut_bail)
        const dMois = new Date(d.getFullYear(), d.getMonth(), 1)
        return dMois.getTime() <= moisCourantDate.getTime()
      } catch {
        return true
      }
    })
    .map(b => {
      const montant = Math.round((Number(b.prix) || 0) + (Number(b.charges) || 0))
      return {
        annonce_id: b.id,
        proprietaire_email: b.proprietaire_email,
        locataire_email: b.locataire_email,
        titre_bien: b.titre,
        mois: moisCourant,
        montant,
        statut: "déclaré",
        created_at: new Date().toISOString(),
      }
    })
    .filter(r => r.montant > 0)  // skip baux sans montant (data corrompue)

  if (insertRows.length === 0) {
    return NextResponse.json({
      ok: true,
      mois_courant: moisCourant,
      baux_actifs: bauxActifs.length,
      loyers_crees: 0,
      duration_ms: Date.now() - t0,
      note: "Tous les baux à créer ont une date_debut > mois courant ou montant nul.",
    })
  }

  const { error: insertErr } = await supabaseAdmin
    .from("loyers")
    .insert(insertRows)

  if (insertErr) {
    console.error("[loyers-mensuels-create] insert failed", insertErr)
    return NextResponse.json({
      ok: false,
      error: insertErr.message,
      mois_courant: moisCourant,
      tentatives: insertRows.length,
      duration_ms: Date.now() - t0,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mois_courant: moisCourant,
    baux_actifs: bauxActifs.length,
    loyers_crees: insertRows.length,
    duration_ms: Date.now() - t0,
  })
})
