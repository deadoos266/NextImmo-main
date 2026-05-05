/**
 * V55.2 — POST /api/locataire/tuto
 * Persiste le statut du walkthrough onboarding locataire.
 *
 * Miroir de V34.3 (proprio). Body : { action: "skip" | "complete" | "reset" }
 * Side-effect : update profils.tuto_locataire_skipped_at OR tuto_locataire_completed_at.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const action = (body as { action?: unknown }).action
  if (action !== "skip" && action !== "complete" && action !== "reset") {
    return NextResponse.json({ ok: false, error: "action invalide" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const patch: Record<string, string | null> = {}
  if (action === "skip") {
    patch.tuto_locataire_skipped_at = now
  } else if (action === "complete") {
    patch.tuto_locataire_completed_at = now
  } else {
    patch.tuto_locataire_skipped_at = null
    patch.tuto_locataire_completed_at = null
  }

  // V67 fix — upsert au lieu d'update : si le row profils n'existe pas
  // (cas possible si le upsert au signup a échoué silencieusement),
  // l'update no-op silencieusement et le tuto re-popup à chaque visite
  // /annonces. L'upsert avec onConflict="email" crée la row si manquante.
  const { error } = await supabaseAdmin
    .from("profils")
    .upsert({ email, ...patch }, { onConflict: "email" })
  if (error) {
    console.error("[locataire/tuto] upsert failed", error)
    return NextResponse.json({ ok: false, error: "Mise à jour a échoué" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, action })
}
