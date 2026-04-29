/**
 * GET /api/profil/candidat/[email] — V29.B (Paul 2026-04-29)
 *
 * Retourne le profil COMPLET d'un candidat (incluant dossier_docs) pour
 * un proprio qui veut consulter le dossier d'un candidat à son annonce.
 *
 * Auth chain :
 *   1. NextAuth session obligatoire.
 *   2. Vérifier que la session.user.email possède au moins une annonce
 *      qui a reçu un message du candidat (target email) OU une candidature
 *      avec ce candidat comme locataire.
 *   3. Si oui → retourne le profil complet (dossier_docs inclus).
 *   4. Sinon → 403 (peer query interdite).
 *
 * Empêche un user random de lire le dossier_docs (CNI, fiches paie) d'un
 * autre user via /api/profil/candidat/victim@test.fr.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const session = await getServerSession(authOptions)
  const myEmail = session?.user?.email?.toLowerCase()
  if (!myEmail) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const { email: rawEmail } = await params
  const targetEmail = decodeURIComponent(rawEmail || "").toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 })
  }
  if (targetEmail === myEmail) {
    // Self-read — utiliser /api/profil/me à la place
    return NextResponse.json({ error: "Utilisez /api/profil/me pour votre propre profil" }, { status: 400 })
  }

  // Vérif autorisation : le caller doit posséder au moins une annonce
  // qui a un message échangé avec le target (= le target est candidat
  // potentiel sur une de ses annonces).
  const { data: ownAnnonces } = await supabaseAdmin
    .from("annonces")
    .select("id")
    .eq("proprietaire_email", myEmail)
  const ownIds = (ownAnnonces ?? []).map(a => a.id)
  if (ownIds.length === 0) {
    return NextResponse.json({ error: "Vous n'êtes propriétaire d'aucune annonce" }, { status: 403 })
  }

  // Chercher un message annonce-scoped entre myEmail et targetEmail
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id")
    .or(`and(from_email.eq.${targetEmail},to_email.eq.${myEmail}),and(from_email.eq.${myEmail},to_email.eq.${targetEmail})`)
    .in("annonce_id", ownIds)
    .limit(1)
    .maybeSingle()
  if (!msg) {
    return NextResponse.json({ error: "Ce candidat n'a pas postulé à vos annonces" }, { status: 403 })
  }

  const { data: profil, error } = await supabaseAdmin
    .from("profils")
    .select("*")
    .eq("email", targetEmail)
    .maybeSingle()
  if (error) {
    console.error("[profil/candidat]", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profil: profil ?? null })
}
