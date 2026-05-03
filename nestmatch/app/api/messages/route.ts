/**
 * V63 — POST /api/messages
 *
 * Endpoint générique pour insérer un message dans une conversation. Utilisé
 * par les flux qui n'ont pas besoin de logique métier dédiée
 * (candidature → /api/messages/candidature, visite → /api/visites/proposer).
 *
 * Cas d'usage typiques :
 *   - Message texte libre (relance candidature, échanges courants)
 *   - Message système préfixé (RETRAIT, RELANCE, etc.)
 *
 * Préreq migration 058 : remplace les `supabase.from("messages").insert([...])`
 * client-side qui dépendaient du grant INSERT anon.
 *
 * Sécurité :
 *   - NextAuth requis. from_email = session strictement (pas de spoof).
 *   - Validation toEmail + contenu (max 4000 chars pour permettre payloads
 *     préfixés avec JSON).
 *   - Rate-limit 30 messages/h/user (filet anti-flood, le smart timing
 *     de l'UI est plus restrictif).
 *   - Pas de message à soi-même.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface Body {
  toEmail?: string
  annonceId?: number | string | null
  contenu?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const fromEmail = session?.user?.email?.toLowerCase()
  if (!fromEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`msg-post:${fromEmail}`, { max: 30, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop d'envois — patientez 1h." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const toEmail = typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(toEmail)) {
    return NextResponse.json({ ok: false, error: "toEmail invalide" }, { status: 400 })
  }
  if (toEmail === fromEmail) {
    return NextResponse.json({ ok: false, error: "Impossible de s'envoyer un message à soi-même" }, { status: 400 })
  }

  const contenu = typeof body.contenu === "string" ? body.contenu.trim().slice(0, 4000) : ""
  if (contenu.length < 1) {
    return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 })
  }

  // annonceId est optionnel mais si fourni doit être un nombre positif
  let annonceId: number | null = null
  if (body.annonceId !== undefined && body.annonceId !== null) {
    const n = Number(body.annonceId)
    if (Number.isFinite(n) && n > 0) annonceId = n
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert([{
      from_email: fromEmail,
      to_email: toEmail,
      contenu,
      lu: false,
      annonce_id: annonceId,
      created_at: now,
    }])
    .select("id, created_at")
    .single()

  if (error) {
    console.error("[messages POST]", error)
    return NextResponse.json({ ok: false, error: "Insert échoué" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: { id: data.id, created_at: data.created_at } })
}
