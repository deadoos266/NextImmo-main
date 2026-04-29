/**
 * POST /api/proprietaire/candidates-dossiers — V29.B (Paul 2026-04-29)
 *
 * Pour la page /proprietaire/annonces/[id]/candidatures : retourne les
 * profils COMPLETS (avec dossier_docs) des candidats à une annonce.
 *
 * Auth chain :
 *   - NextAuth obligatoire.
 *   - Vérifier que session.user.email == annonce.proprietaire_email.
 *
 * Body : { annonceId: number; emails: string[] }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const myEmail = session?.user?.email?.toLowerCase()
  if (!myEmail) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  let body: { annonceId: number; emails: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  const annonceId = Number(body.annonceId)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ error: "annonceId invalide" }, { status: 400 })
  }

  // Verify ownership
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 })
  }
  if ((annonce.proprietaire_email || "").toLowerCase() !== myEmail) {
    return NextResponse.json({ error: "Cette annonce ne vous appartient pas" }, { status: 403 })
  }

  const emails = Array.isArray(body.emails)
    ? body.emails
        .filter((e): e is string => typeof e === "string")
        .map(e => e.trim().toLowerCase())
        .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        .slice(0, 200)
    : []
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, profils: [] })
  }

  const { data, error } = await supabaseAdmin
    .from("profils")
    .select("*")
    .in("email", emails)
  if (error) {
    console.error("[proprietaire/candidates-dossiers]", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profils: data ?? [] })
}
