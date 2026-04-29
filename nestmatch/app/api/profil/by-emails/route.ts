/**
 * POST /api/profil/by-emails — V29.B (Paul 2026-04-29)
 *
 * Retourne les profils PUBLICS pour une liste d'emails (pour afficher
 * peer info dans messages, candidatures listing, etc.).
 *
 * Body : { emails: string[]; cols?: string[] }
 * Auth : NextAuth obligatoire.
 * Whitelist colonnes : par défaut juste les champs PUBLICS (pas
 * dossier_docs jamais !). Si `cols` fourni, filtré contre la whitelist.
 *
 * Sites cibles : messages/page.tsx (peer match cols), carnet/page.tsx
 * (locataires noms), candidatures listing (avec extension via "matching"
 * scope plus large).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

// Colonnes PUBLIQUES safe à exposer pour n'importe quel utilisateur authentifié.
// JAMAIS : dossier_docs, telephone, revenus, civilite, date_naissance,
// nationalite, situation_familiale, nb_enfants, anciens_logements.
const PUBLIC_COLS = new Set([
  "email", "prenom", "nom", "photo_url_custom", "bio_publique",
  "telephone", // visible dans messages thread (cf bouton "Appel")
  "is_proprietaire",
  // Match cols (V2.6) — utilisés par messages pour calculer compat peers
  "ville_souhaitee", "budget_min", "budget_max", "surface_min", "surface_max",
  "pieces_min", "chambres_min", "type_quartier", "mode_localisation",
  "type_bail", "meuble", "parking", "balcon", "terrasse", "jardin",
  "cave", "fibre", "ascenseur", "animaux", "fumeur",
  "dpe_min", "dpe_min_actif", "tolerance_budget_pct",
  "preferences_equipements",
  "quartier_prefere_lat", "quartier_prefere_lng", "quartier_prefere_label",
])

interface ByEmailsBody {
  emails: string[]
  cols?: string[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  let body: ByEmailsBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
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

  // Filtre les colonnes contre la whitelist
  let cols = "*"
  if (Array.isArray(body.cols) && body.cols.length > 0) {
    const filtered = body.cols
      .filter((c): c is string => typeof c === "string")
      .filter(c => PUBLIC_COLS.has(c))
      .slice(0, 50)
    cols = filtered.length > 0 ? filtered.join(", ") : Array.from(PUBLIC_COLS).join(", ")
  } else {
    // Default = toutes les colonnes publiques
    cols = Array.from(PUBLIC_COLS).join(", ")
  }

  const { data, error } = await supabaseAdmin
    .from("profils")
    .select(cols)
    .in("email", emails)
  if (error) {
    console.error("[profil/by-emails]", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profils: data ?? [] })
}
