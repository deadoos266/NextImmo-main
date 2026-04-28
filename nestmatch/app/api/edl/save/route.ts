/**
 * POST /api/edl/save — V24.1 (Paul 2026-04-29)
 *
 * Upsert d'un état des lieux côté serveur (supabaseAdmin) avec gating
 * NextAuth. Remplace les écritures client direct sur `etats_des_lieux`
 * pour permettre REVOKE INSERT/UPDATE anon (migration 034).
 *
 * Body :
 *   - id?: string (UUID si update, absent si insert)
 *   - annonce_id: number
 *   - autres champs EDL (type, date_edl, pieces_data, statut, etc.)
 *
 * Auth : session NextAuth obligatoire. Vérif :
 *   - propriétaire_email = session.user.email (pour create/update)
 *   - OU locataire concerné (limited fields update — contestation)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

// Whitelist des champs autorisés (anti-injection sur colonnes sensibles)
const ALLOWED_FIELDS = new Set([
  "annonce_id", "proprietaire_email", "type", "date_edl",
  "prenom_bailleur", "nom_bailleur", "email_bailleur",
  "prenom_locataire", "nom_locataire", "email_locataire", "locataire_email",
  "compteurs", "cles", "observations", "pieces_data",
  "statut", "commentaire_locataire",
])

const VALID_STATUTS = new Set(["brouillon", "envoye", "valide", "conteste"])

interface SaveBody {
  id?: string
  [k: string]: unknown
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  let body: SaveBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 })
  }

  // Filtre les champs whitelist
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) payload[k] = v
  }

  if (payload.statut !== undefined && !VALID_STATUTS.has(String(payload.statut))) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 })
  }

  const id = typeof body.id === "string" && body.id ? body.id : null

  if (id) {
    // UPDATE — vérif propriétaire OU locataire (cas contestation)
    const { data: existing } = await supabaseAdmin
      .from("etats_des_lieux")
      .select("proprietaire_email, locataire_email, email_locataire")
      .eq("id", id)
      .single()
    if (!existing) {
      return NextResponse.json({ error: "EDL introuvable" }, { status: 404 })
    }
    const isProp = (existing.proprietaire_email || "").toLowerCase() === email
    const isLoc =
      (existing.locataire_email || "").toLowerCase() === email ||
      (existing.email_locataire || "").toLowerCase() === email
    if (!isProp && !isLoc) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
    }
    // Locataire : ne peut update QUE statut + commentaire_locataire (contestation)
    if (!isProp && isLoc) {
      const allowed = new Set(["statut", "commentaire_locataire"])
      for (const k of Object.keys(payload)) {
        if (!allowed.has(k)) delete payload[k]
      }
      if (payload.statut && payload.statut !== "conteste") {
        return NextResponse.json({ error: "Locataire ne peut que contester" }, { status: 403 })
      }
    }
    const { data, error } = await supabaseAdmin
      .from("etats_des_lieux")
      .update(payload)
      .eq("id", id)
      .select()
      .single()
    if (error) {
      console.error("[edl/save UPDATE]", error)
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, edl: data })
  }

  // INSERT — proprietaire_email forcé = session
  payload.proprietaire_email = email
  const { data, error } = await supabaseAdmin
    .from("etats_des_lieux")
    .insert([payload])
    .select()
    .single()
  if (error) {
    console.error("[edl/save INSERT]", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, edl: data })
}
