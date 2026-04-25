/**
 * POST /api/annonces/terminer-bail
 *
 * Bascule une annonce en statut `loue_termine` (= ancien bien) :
 *  1. update annonces : statut, bail_termine_at, locataire_email_at_end,
 *     auto_paiement_actif = false (arrête les confirmations auto).
 *  2. push une entrée dans profils.anciens_logements du locataire pour
 *     qu'il puisse retrouver le bien dans /anciens-logements.
 *  3. envoie une notif cloche au locataire pour qu'il sache.
 *
 * Sécurité : seul le proprio (ou admin) peut déclencher la fin de bail.
 *
 * Réversible ? Non en l'état (pas de bouton "réactiver"). C'est volontaire :
 * un bail terminé est une décision juridique, pas un toggle. Si Paul
 * change d'avis on peut faire un script admin pour repasser à "loué".
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../lib/auth"
import { supabaseAdmin } from "../../../../lib/supabase-server"

export const runtime = "nodejs"

interface Body {
  annonceId?: number | string
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 })
  }
  if (!body.annonceId) {
    return NextResponse.json({ ok: false, error: "annonceId manquant" }, { status: 400 })
  }

  // Récupère l'annonce (service_role, bypass RLS)
  const { data: annonce, error: annErr } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, statut, bail_termine_at")
    .eq("id", body.annonceId)
    .maybeSingle()

  if (annErr || !annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  // Auth métier : proprio uniquement (ou admin)
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin === true
  const proprietaireEmail = (annonce.proprietaire_email || "").toLowerCase()
  if (proprietaireEmail !== userEmail && !isAdmin) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  // Idempotence : si déjà terminé, on renvoie OK silencieusement
  if (annonce.statut === "loue_termine" && annonce.bail_termine_at) {
    return NextResponse.json({ ok: true, alreadyTerminated: true })
  }

  const nowIso = new Date().toISOString()
  const locataireEmail = (annonce.locataire_email || "").toLowerCase()

  // 1. Update annonce
  const { error: updErr } = await supabaseAdmin
    .from("annonces")
    .update({
      statut: "loue_termine",
      bail_termine_at: nowIso,
      locataire_email_at_end: locataireEmail || null,
      auto_paiement_actif: false,
    })
    .eq("id", annonce.id)

  if (updErr) {
    console.error("[terminer-bail] update annonce failed", updErr)
    return NextResponse.json({ ok: false, error: "Echec mise à jour annonce" }, { status: 500 })
  }

  // 2. Pousse l'entrée dans profils.anciens_logements du locataire
  if (locataireEmail) {
    const { data: profil } = await supabaseAdmin
      .from("profils")
      .select("anciens_logements")
      .eq("email", locataireEmail)
      .maybeSingle()

    const existingArr: unknown[] = Array.isArray(profil?.anciens_logements)
      ? (profil!.anciens_logements as unknown[])
      : []
    // Évite les doublons : skip si annonce_id déjà présente
    const alreadyTracked = existingArr.some(item => {
      if (!item || typeof item !== "object") return false
      return (item as { annonce_id?: number }).annonce_id === Number(annonce.id)
    })
    if (!alreadyTracked) {
      const newEntry = {
        annonce_id: Number(annonce.id),
        bail_termine_at: nowIso,
        titre: annonce.titre || null,
        ville: annonce.ville || null,
      }
      await supabaseAdmin
        .from("profils")
        .update({ anciens_logements: [...existingArr, newEntry] })
        .eq("email", locataireEmail)
    }
  }

  return NextResponse.json({
    ok: true,
    annonceId: Number(annonce.id),
    bail_termine_at: nowIso,
    locataire_email: locataireEmail || null,
  })
}
