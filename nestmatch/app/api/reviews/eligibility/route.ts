/**
 * V97.35 P3-3 — GET /api/reviews/eligibility?annonce_id=X
 *
 * Indique si l'utilisateur connecté peut laisser une review sur cette
 * annonce, et avec quel rôle / target. Utilisé par l'UI pour afficher ou
 * masquer le bouton "Laisser une review".
 *
 * Auth : session NextAuth obligatoire.
 *
 * Réponse :
 *   {
 *     ok: true,
 *     eligible: true,
 *     role: "locataire" | "proprietaire",
 *     target_email: "x@x.fr",
 *     historique_bail_id: 42 | null
 *   }
 * ou
 *   { ok: true, eligible: false, reason: "...", already_submitted: true }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkReviewEligibility } from "@/lib/reviews/eligibility"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const annonce_id = Number(req.nextUrl.searchParams.get("annonce_id") || 0)
  if (!Number.isFinite(annonce_id) || annonce_id <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id requis" }, { status: 400 })
  }

  const result = await checkReviewEligibility(me, annonce_id)
  return NextResponse.json({ ok: true, ...result })
}
