/**
 * V57.2 — POST /api/baux/restitution-depot
 *
 * Le proprio enregistre la restitution du dépôt de garantie au locataire,
 * potentiellement avec retenues pour dégradations imputables.
 *
 * Délai légal ALUR (loi du 6 juillet 1989, art. 22) :
 *   - 1 mois après remise des clés si pas de retenue
 *   - 2 mois si retenue (avec justificatifs OBLIGATOIRES)
 *   - Au-delà : intérêts de 10% du loyer mensuel par mois de retard
 *
 * Body : {
 *   annonceId: number,
 *   montantRetenu: number      // 0 si restitution intégrale
 *   motifsRetenue?: Array<{ libelle: string; montant: number; type: "degradation" | "loyer_impaye" | "charges" | "autre" }>
 * }
 *
 * Effets :
 *   1. Update annonces.depot_restitue_at + depot_montant_retenu + depot_motifs_retenue
 *   2. Insert message [DEPOT_RESTITUE] dans le thread (locataire <-> proprio)
 *   3. Notif cloche locataire
 *   4. Email locataire (template depotRestitueTemplate à venir)
 *
 * Sécurité : NextAuth + match proprietaire_email.
 *
 * Validation :
 *   - montantRetenu >= 0 et <= caution
 *   - Si montantRetenu > 0, motifsRetenue requis (justificatifs ALUR)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { generateSoldePDFBuffer, type MotifRetenue as PdfMotifRetenue } from "@/lib/quittanceSoldeToutCompte"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface MotifRetenue {
  libelle: string
  montant: number
  type: "degradation" | "loyer_impaye" | "charges" | "autre"
}

interface Body {
  annonceId?: number | string
  montantRetenu?: number
  motifsRetenue?: MotifRetenue[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // V64 — rate-limit 5/h/user. Action financière (restitution dépôt +
  // génération PDF "Solde de tout compte"). Le check `depot_restitue_at`
  // bloque déjà la double-restitution, mais RL évite les bursts.
  const rl = await checkRateLimitAsync(`restitution-depot:${userEmail}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de tentatives, réessayez plus tard" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const annonceId = Number(body.annonceId)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  const montantRetenu = Math.max(0, Number(body.montantRetenu) || 0)
  const motifsRetenue: MotifRetenue[] = Array.isArray(body.motifsRetenue) ? body.motifsRetenue : []

  // Validation motifs si retenue
  if (montantRetenu > 0 && motifsRetenue.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "Une retenue sur dépôt requiert des justificatifs (motifsRetenue). C'est une obligation légale ALUR.",
    }, { status: 400 })
  }
  // Cohérence sum(motifs) ≈ montantRetenu (tolérance 1€ pour arrondis)
  if (motifsRetenue.length > 0) {
    const sumMotifs = motifsRetenue.reduce((acc, m) => acc + Math.max(0, Number(m.montant) || 0), 0)
    if (Math.abs(sumMotifs - montantRetenu) > 1) {
      return NextResponse.json({
        ok: false,
        error: `Incohérence : la somme des motifs (${sumMotifs}€) doit égaler le montant retenu (${montantRetenu}€).`,
      }, { status: 400 })
    }
  }

  // Récupère l'annonce + verify ownership + caution
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, caution, depot_restitue_at, bail_termine_at, preavis_fin_calculee")
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
    return NextResponse.json({ ok: false, error: "Pas de locataire actif" }, { status: 400 })
  }
  const caution = Number(ann.caution || 0)
  if (caution <= 0) {
    return NextResponse.json({ ok: false, error: "Pas de dépôt de garantie sur ce bail" }, { status: 400 })
  }
  if (montantRetenu > caution) {
    return NextResponse.json({
      ok: false,
      error: `Le montant retenu (${montantRetenu}€) dépasse le dépôt de garantie (${caution}€).`,
    }, { status: 400 })
  }
  if (ann.depot_restitue_at) {
    return NextResponse.json({
      ok: false,
      error: "Le dépôt de garantie a déjà été restitué pour ce bail.",
      restitueAt: ann.depot_restitue_at,
    }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const montantRestitue = caution - montantRetenu

  // 1. Update annonces
  const { error: updErr } = await supabaseAdmin
    .from("annonces")
    .update({
      depot_restitue_at: nowIso,
      depot_montant_retenu: montantRetenu,
      depot_motifs_retenue: motifsRetenue,
    })
    .eq("id", annonceId)
  if (updErr) {
    console.error("[restitution-depot] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Insert message [DEPOT_RESTITUE] dans le thread
  const messagePayload = JSON.stringify({
    annonceId,
    bienTitre: ann.titre,
    caution,
    montantRetenu,
    montantRestitue,
    motifsRetenue,
    restitueAt: nowIso,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: propEmail,
    to_email: locEmail,
    contenu: `[DEPOT_RESTITUE]${messagePayload}`,
    lu: false,
    annonce_id: annonceId,
    created_at: nowIso,
  }])

  // 3. Notif cloche locataire
  await supabaseAdmin.from("notifications").insert([{
    user_email: locEmail,
    type: "depot_restitue",
    title: montantRetenu > 0 ? "Dépôt de garantie restitué (avec retenue)" : "Dépôt de garantie restitué",
    body: montantRetenu > 0
      ? `${montantRestitue}€ vous sont restitués sur les ${caution}€ de dépôt (${montantRetenu}€ retenus pour dégradations).`
      : `Restitution intégrale de ${caution}€ pour « ${ann.titre || "votre logement"} ».`,
    href: "/mon-logement#depot",
    related_id: String(annonceId),
    created_at: nowIso,
  }])

  // 4. V58.4 — Génération PDF "Quittance solde de tout compte" + upload + msg
  let soldePdfUrl: string | null = null
  try {
    // Récupère les infos profils + dates bail nécessaires au PDF
    const [{ data: bailleurProf }, { data: locataireProf }, { data: annDetails }] = await Promise.all([
      supabaseAdmin.from("profils").select("nom, prenom, adresse").eq("email", propEmail).maybeSingle(),
      supabaseAdmin.from("profils").select("nom, prenom").eq("email", locEmail).maybeSingle(),
      supabaseAdmin.from("annonces").select("date_debut_bail, prix, charges, adresse").eq("id", annonceId).maybeSingle(),
    ])
    // Calcul total loyers + durée
    let totalLoyersPercus = 0
    let dureeMois = 0
    let dateDebutBail = ""
    if (annDetails?.date_debut_bail) {
      dateDebutBail = String(annDetails.date_debut_bail)
      const start = new Date(dateDebutBail).getTime()
      const end = new Date(ann.bail_termine_at || nowIso).getTime()
      if (Number.isFinite(start) && Number.isFinite(end)) {
        dureeMois = Math.max(1, Math.round((end - start) / (30 * 24 * 3600 * 1000)))
      }
      const { data: loyers } = await supabaseAdmin
        .from("loyers")
        .select("montant, charges, statut, mois")
        .eq("annonce_id", annonceId)
        .eq("statut", "confirmé")
        .gte("mois", dateDebutBail.slice(0, 7))
      if (loyers) {
        totalLoyersPercus = loyers.reduce((acc, l) => acc + Number(l.montant || 0) + Number(l.charges || 0), 0)
      }
    }
    const nomBailleur = [bailleurProf?.prenom, bailleurProf?.nom].filter(Boolean).join(" ").trim() || propEmail
    const nomLocataire = [locataireProf?.prenom, locataireProf?.nom].filter(Boolean).join(" ").trim() || locEmail
    const pdfBuffer = generateSoldePDFBuffer({
      nomBailleur,
      emailBailleur: propEmail,
      adresseBailleur: bailleurProf?.adresse || null,
      nomLocataire,
      emailLocataire: locEmail,
      titreBien: ann.titre || "Logement",
      adresseBien: annDetails?.adresse || "",
      villeBien: ann.ville || "",
      dateDebutBail,
      dateFinBail: (ann.bail_termine_at || nowIso).slice(0, 10),
      dureeMois,
      totalLoyersPercus,
      caution,
      depotMontantRestitue: montantRestitue,
      depotMontantRetenu: montantRetenu,
      motifsRetenue: motifsRetenue as PdfMotifRetenue[],
      dateEmission: nowIso.slice(0, 10),
    })
    // Upload bucket `baux` (réutilisation existante, public)
    const path = `${propEmail}/${annonceId}/solde_tout_compte_${Date.now()}.pdf`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("baux")
      .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: false })
    if (!uploadErr) {
      const { data: urlData } = supabaseAdmin.storage.from("baux").getPublicUrl(path)
      soldePdfUrl = urlData.publicUrl
      // Insert message [SOLDE_TOUT_COMPTE] pour qu'il apparaisse dans la conv + Documents partagés
      const soldePayload = JSON.stringify({
        annonceId,
        bienTitre: ann.titre,
        url: soldePdfUrl,
        montantRestitue,
        montantRetenu,
        emisAt: nowIso,
      })
      await supabaseAdmin.from("messages").insert([{
        from_email: propEmail,
        to_email: locEmail,
        contenu: `[SOLDE_TOUT_COMPTE]${soldePayload}`,
        lu: false,
        annonce_id: annonceId,
        created_at: nowIso,
      }])
    } else {
      console.warn("[restitution-depot] solde PDF upload failed:", uploadErr.message)
    }
  } catch (e) {
    console.warn("[restitution-depot] solde PDF generation failed:", e)
  }

  return NextResponse.json({
    ok: true,
    annonceId,
    caution,
    montantRetenu,
    montantRestitue,
    restitueAt: nowIso,
    soldePdfUrl,
  })
}
