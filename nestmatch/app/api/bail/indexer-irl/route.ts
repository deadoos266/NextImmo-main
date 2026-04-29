/**
 * V34.6 — POST /api/bail/indexer-irl
 * Applique une indexation IRL annuelle au bail.
 *
 * Body : { annonceId: number, irlNouveau?: number }
 *   irlNouveau optionnel : default = irlDernier() (le plus récent INSEE).
 *
 * Side-effects :
 * - Calcule nouveau loyer = ancien × (irlNouveau / irlAncien).
 * - Update annonces.prix (= nouveauLoyer HC) + irl_reference_courant
 *   + irl_derniere_indexation_at.
 * - Update les loyers FUTURS (mois > now) avec le nouveau montant CC.
 * - Insert message [IRL_INDEXATION] dans le thread + notif locataire.
 *
 * Auth : NextAuth + match proprio.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { irlDernier, calculerNouveauLoyer, fenetreIndexation } from "@/lib/irl"

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
  const annonceId = Number((body as { annonceId?: unknown }).annonceId)
  const irlNouveauOverride = (body as { irlNouveau?: unknown }).irlNouveau
  if (!Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }

  const { data: annonce, error: errAnn } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, prix, charges, date_debut_bail, irl_reference_initial, irl_reference_courant, irl_derniere_indexation_at, bail_signe_locataire_at")
    .eq("id", annonceId)
    .single()
  if (errAnn || !annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  if ((annonce.proprietaire_email || "").toLowerCase() !== userEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé (proprio uniquement)" }, { status: 403 })
  }
  if (!annonce.bail_signe_locataire_at) {
    return NextResponse.json({ ok: false, error: "Bail pas encore actif" }, { status: 400 })
  }

  // Vérifier la fenêtre d'indexation
  const fenetre = fenetreIndexation(annonce.date_debut_bail || new Date(), annonce.irl_derniere_indexation_at || null)
  if (!fenetre.eligible) {
    return NextResponse.json({
      ok: false,
      error: "Indexation non éligible (anniversaire éloigné ou indexation récente)",
      prochaineDate: fenetre.prochaineDateAnniversaire.toISOString().slice(0, 10),
    }, { status: 400 })
  }

  // IRL ancien = irl_reference_courant si défini, sinon récup dernier connu
  // au moment de la signature (à défaut, on prend le dernier - 1 trimestre).
  const irlAncien = Number(annonce.irl_reference_courant) || Number(annonce.irl_reference_initial) || (irlDernier().indice - 1)
  const irlNouveau = Number(irlNouveauOverride) || irlDernier().indice
  if (!Number.isFinite(irlAncien) || !Number.isFinite(irlNouveau) || irlAncien <= 0 || irlNouveau <= 0) {
    return NextResponse.json({ ok: false, error: "IRL invalides" }, { status: 400 })
  }

  const ancienLoyerHC = Number(annonce.prix) || 0
  if (ancienLoyerHC <= 0) {
    return NextResponse.json({ ok: false, error: "Loyer actuel introuvable" }, { status: 400 })
  }
  const calc = calculerNouveauLoyer(ancienLoyerHC, irlAncien, irlNouveau)

  const now = new Date()
  const nowIso = now.toISOString()

  // Update annonce
  const { error: updErr } = await supabaseAdmin
    .from("annonces")
    .update({
      prix: calc.nouveauLoyer,
      irl_reference_courant: irlNouveau,
      irl_reference_initial: annonce.irl_reference_initial || irlAncien,
      irl_derniere_indexation_at: nowIso,
    })
    .eq("id", annonceId)
  if (updErr) {
    console.error("[bail/indexer-irl] update annonce failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // Update les loyers FUTURS (mois >= prochain mois calendaire)
  const moisProchainKey = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })()
  const nouveauCC = calc.nouveauLoyer + Number(annonce.charges || 0)
  await supabaseAdmin
    .from("loyers")
    .update({ montant: nouveauCC })
    .eq("annonce_id", annonceId)
    .gte("mois", moisProchainKey)
    .neq("statut", "confirmé") // ne pas réviser les loyers déjà payés !

  // Message in-app + notif locataire
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  if (locEmail) {
    const payload = JSON.stringify({
      ancienLoyer: ancienLoyerHC,
      nouveauLoyer: calc.nouveauLoyer,
      variation: calc.variation,
      variationPct: calc.variationPct,
      irlAncien,
      irlNouveau,
      appliqueAt: nowIso,
      moisDebut: moisProchainKey,
    })
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: locEmail,
      contenu: `[IRL_INDEXATION]${payload}`,
      lu: false,
      annonce_id: annonceId,
      created_at: nowIso,
    }])
    await supabaseAdmin.from("notifications").insert([{
      user_email: locEmail,
      type: "irl_indexation",
      title: "Loyer revalorisé (IRL)",
      body: `Nouveau loyer HC : ${calc.nouveauLoyer.toLocaleString("fr-FR")} € (${calc.variation > 0 ? "+" : ""}${calc.variation.toFixed(2)} €) dès ${moisProchainKey}.`,
      href: "/mon-logement",
      related_id: String(annonceId),
      lu: false,
      created_at: nowIso,
    }])
  }

  return NextResponse.json({
    ok: true,
    ancienLoyer: ancienLoyerHC,
    nouveauLoyer: calc.nouveauLoyer,
    variation: calc.variation,
    variationPct: calc.variationPct,
    irlAncien,
    irlNouveau,
    moisDebut: moisProchainKey,
  })
}
