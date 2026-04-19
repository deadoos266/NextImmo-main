/**
 * GET  /api/profil/vacances  — Lit l'état vacances du profil courant.
 * POST /api/profil/vacances  — Met à jour vacances_actif + vacances_message.
 *
 * Motif : ne pas passer par l'anon client Supabase côté browser pour un
 * UPDATE sur profils — sans RLS stricte, un user malveillant pourrait
 * manipuler le champ d'un autre profil. Ici l'email est forcé depuis la
 * session NextAuth, impossible de toucher qqn d'autre.
 *
 * Body POST :
 *   { actif: boolean, message?: string | null }
 * Réponse :
 *   { ok: true, vacances_actif, vacances_message }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

const MAX_MESSAGE_LENGTH = 400

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("profils")
    .select("vacances_actif, vacances_message")
    .eq("email", email)
    .maybeSingle()
  if (error) {
    console.error("[profil vacances GET]", error)
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    vacances_actif: data?.vacances_actif ?? false,
    vacances_message: data?.vacances_message ?? null,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`vacances:${email}:${ip}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de modifications récentes" }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 })
  }

  const payload = body as { actif?: unknown; message?: unknown }
  const actif = payload.actif === true
  let message: string | null = null
  if (typeof payload.message === "string") {
    const trimmed = payload.message.trim()
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message trop long (max ${MAX_MESSAGE_LENGTH} caractères)` },
        { status: 400 },
      )
    }
    message = trimmed.length > 0 ? trimmed : null
  } else if (payload.message === null) {
    message = null
  }

  // Upsert ciblé : si le profil n'existe pas encore (avatar jamais uploadé),
  // on l'initialise avec email + nom fallback pour éviter violation NOT NULL.
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("profils")
    .select("email")
    .eq("email", email)
    .maybeSingle()
  if (selErr) {
    console.error("[profil vacances select]", selErr)
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
  }

  if (existing) {
    const { error: updErr } = await supabaseAdmin
      .from("profils")
      .update({ vacances_actif: actif, vacances_message: message })
      .eq("email", email)
    if (updErr) {
      console.error("[profil vacances update]", updErr)
      return NextResponse.json({ error: `Erreur base de données : ${updErr.message}` }, { status: 500 })
    }
  } else {
    const fallbackNom = session.user?.name?.trim() || email.split("@")[0] || "Utilisateur"
    const { error: insErr } = await supabaseAdmin
      .from("profils")
      .insert({ email, nom: fallbackNom, vacances_actif: actif, vacances_message: message })
    if (insErr) {
      console.error("[profil vacances insert]", insErr)
      return NextResponse.json({ error: `Erreur base de données : ${insErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    vacances_actif: actif,
    vacances_message: message,
  })
}
