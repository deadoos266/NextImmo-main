/**
 * POST /api/profil/save — V24.3 (Paul 2026-04-29)
 *
 * Centralise les writes sur la table `profils` (upsert/insert/update) côté
 * serveur avec gating NextAuth. Remplace les writes client direct pour
 * permettre REVOKE INSERT/UPDATE anon (migration 035).
 *
 * Body : partial profil row.
 *  - email est FORCÉ = session.user.email (le client ne peut pas écraser
 *    le profil d'un autre utilisateur).
 *  - tous les autres champs sont passthrough (whitelist anti-injection
 *    sur les colonnes admin uniquement : is_admin, is_banned).
 *
 * Auth : NextAuth session obligatoire. Sinon 401.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

// Champs admin-only — un user ne peut pas se les attribuer via cette route.
const ADMIN_ONLY_FIELDS = new Set([
  "is_admin", "is_banned", "ban_reason", "id",
])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  // Filtre les champs admin-only que le user ne peut pas modifier sur soi-même.
  // (les admins utilisent /api/admin/users pour ces ops)
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!ADMIN_ONLY_FIELDS.has(k)) payload[k] = v
  }
  // Email forcé = session (anti-spoof : un user ne peut pas upsert le profil
  // de quelqu'un d'autre).
  payload.email = email

  const { data, error } = await supabaseAdmin
    .from("profils")
    .upsert(payload, { onConflict: "email" })
    .select()
    .single()

  if (error) {
    console.error("[profil/save] upsert failed:", error.message)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profil: data })
}
