/**
 * V97.35 P3-3 — POST /api/reviews
 *
 * Soumet une review (locataire→proprio ou proprio→locataire) sur une
 * annonce. Vérifie l'éligibilité côté serveur (anti-bypass UI) et applique
 * la mécanique double-aveugle :
 *  - Si la review réciproque existe déjà en attente → on publie les 2.
 *  - Sinon → ma review reste avec published_at = NULL.
 *
 * Body :
 *   {
 *     annonce_id: 42,
 *     score_global: 4,
 *     score_details?: { reactivite: 5, transparence: 4, ... },
 *     comment?: "Texte libre 1500 chars max"
 *   }
 *
 * Auth : session NextAuth obligatoire.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkReviewEligibility, tryPublishReciprocal } from "@/lib/reviews/eligibility"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Body {
  annonce_id?: number
  score_global?: number
  score_details?: Record<string, number>
  comment?: string
}

const ALLOWED_SUBSCORES_LOCATAIRE = ["reactivite", "transparence", "etat_logement", "equite"]
const ALLOWED_SUBSCORES_PROPRIO = ["paiement_ponctuel", "respect_logement", "communication", "voisinage"]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const annonce_id = Number(body.annonce_id || 0)
  const score_global = Number(body.score_global || 0)
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 1500).trim() : null
  const score_details_raw = body.score_details && typeof body.score_details === "object" ? body.score_details : {}

  if (!Number.isFinite(annonce_id) || annonce_id <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id requis" }, { status: 400 })
  }
  if (!Number.isInteger(score_global) || score_global < 1 || score_global > 5) {
    return NextResponse.json({ ok: false, error: "score_global doit être entre 1 et 5" }, { status: 400 })
  }

  // Vérif éligibilité
  const eligibility = await checkReviewEligibility(me, annonce_id)
  if (!eligibility.eligible || !eligibility.role || !eligibility.target_email) {
    return NextResponse.json({
      ok: false,
      error: eligibility.reason || "Non éligible",
      already_submitted: eligibility.already_submitted,
    }, { status: 403 })
  }

  // Whitelist score_details selon rôle
  const allowedKeys = eligibility.role === "locataire" ? ALLOWED_SUBSCORES_LOCATAIRE : ALLOWED_SUBSCORES_PROPRIO
  const score_details: Record<string, number> = {}
  for (const k of allowedKeys) {
    const v = Number(score_details_raw[k])
    if (Number.isInteger(v) && v >= 1 && v <= 5) score_details[k] = v
  }

  // INSERT review
  const { data: inserted, error } = await supabaseAdmin
    .from("reviews")
    .insert({
      annonce_id,
      historique_bail_id: eligibility.historique_bail_id,
      author_email: me,
      target_email: eligibility.target_email,
      role: eligibility.role,
      score_global,
      score_details,
      comment,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    console.error("[api/reviews POST]", error)
    return NextResponse.json({ ok: false, error: error?.message || "Erreur insert" }, { status: 500 })
  }

  // Tentative publication double-aveugle
  const published_ids = await tryPublishReciprocal(annonce_id, me, eligibility.target_email)

  // Notif cloche si publiée OU notif "en attente de l'autre partie"
  if (published_ids.length > 0) {
    // Les 2 parties sont maintenant publiées
    await supabaseAdmin.from("notifications").insert([
      {
        user_email: me,
        type: "review_published",
        title: "Votre avis est publié",
        body: `Votre avis sur ${eligibility.target_email} est maintenant visible.`,
        href: `/profil/${encodeURIComponent(eligibility.target_email)}`,
        related_id: String(inserted.id),
        lu: false,
      },
      {
        user_email: eligibility.target_email,
        type: "review_published",
        title: "Vous avez reçu un avis",
        body: `${me} a publié un avis sur vous.`,
        href: `/profil/${encodeURIComponent(me)}`,
        related_id: String(inserted.id),
        lu: false,
      },
    ])
  } else {
    // Ma review est en attente, demande au target de soumettre la sienne
    await supabaseAdmin.from("notifications").insert({
      user_email: eligibility.target_email,
      type: "review_pending",
      title: "Avis en attente",
      body: `${me} a laissé un avis sur vous. Laissez le vôtre pour que les 2 soient publiés.`,
      href: `/annonces/${annonce_id}#review`,
      related_id: String(inserted.id),
      lu: false,
    })
  }

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    published: published_ids.length > 0,
    published_ids,
  })
}
