/**
 * V63 — POST /api/messages/candidature
 *
 * Encapsule la logique de premier contact d'un locataire vers le proprio
 * sur une annonce :
 *   1. Vérifie l'auth NextAuth (from_email = session).
 *   2. Vérifie que l'annonce existe + récupère le proprietaire_email.
 *   3. Dedupe : si une conv existe déjà sur cette annonce, on ajoute le
 *      message simple (pas de re-flag candidature). Sinon premier message
 *      avec type='candidature' (déclenche le statut côté proprio).
 *   4. Notif cloche au proprio (SEULEMENT si premier contact).
 *
 * Préreq migration 058 (RLS Phase 5 final) — remplace l'ancien duo
 * `supabase.from("messages").select(...)` + `.insert(...)` côté client de
 * ContactButton.tsx.
 *
 * Sécurité :
 *   - NextAuth requis. from_email = session.user.email (pas confiance au body).
 *   - Validation annonceId + contenu (max 2000 chars).
 *   - Rate-limit 10 candidatures/heure/user (anti-spam).
 *   - Pas de candidature sur sa propre annonce.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface Body {
  annonceId?: number | string
  contenu?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const fromEmail = session?.user?.email?.toLowerCase()
  if (!fromEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // Rate-limit
  const rl = await checkRateLimitAsync(`msg-candidature:${fromEmail}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de candidatures récentes — patientez 1h." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const annonceId = Number(body.annonceId)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  const contenu = typeof body.contenu === "string" ? body.contenu.trim().slice(0, 2000) : ""
  if (contenu.length < 1) {
    return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 })
  }

  // Lookup annonce
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, proprietaire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const toEmail = (annonce.proprietaire_email || "").toLowerCase()
  if (!toEmail) {
    return NextResponse.json({ ok: false, error: "Pas de propriétaire associé" }, { status: 400 })
  }
  if (toEmail === fromEmail) {
    return NextResponse.json({ ok: false, error: "Vous ne pouvez pas candidater sur votre propre annonce" }, { status: 400 })
  }

  // Dedupe : check si une conv existe déjà (dans n'importe quel sens)
  const [{ data: sent }, { data: received }] = await Promise.all([
    supabaseAdmin.from("messages").select("id")
      .eq("from_email", fromEmail).eq("to_email", toEmail).eq("annonce_id", annonceId).limit(1),
    supabaseAdmin.from("messages").select("id")
      .eq("from_email", toEmail).eq("to_email", fromEmail).eq("annonce_id", annonceId).limit(1),
  ])
  const hasConversation = (sent && sent.length > 0) || (received && received.length > 0)

  // Insert message
  const now = new Date().toISOString()
  const { error: insErr } = await supabaseAdmin.from("messages").insert([{
    from_email: fromEmail,
    to_email: toEmail,
    contenu,
    lu: false,
    annonce_id: annonceId,
    // `type: "candidature"` SEULEMENT au tout premier message pour ne pas
    // re-flag (le statut_candidature est porté par cette première row).
    type: hasConversation ? undefined : "candidature",
    statut_candidature: hasConversation ? undefined : "en_attente",
    created_at: now,
  }])
  if (insErr) {
    console.error("[messages/candidature] insert failed", insErr)
    return NextResponse.json({ ok: false, error: "Insert échoué" }, { status: 500 })
  }

  // Notif cloche proprio uniquement si premier contact
  if (!hasConversation) {
    await supabaseAdmin.from("notifications").insert([{
      user_email: toEmail,
      type: "message",
      title: "Nouvelle candidature",
      body: `Un locataire est intéressé par « ${annonce.titre || "votre bien"} »`,
      href: "/messages",
      related_id: String(annonceId),
      lu: false,
      created_at: now,
    }])
  }

  return NextResponse.json({
    ok: true,
    isFirstContact: !hasConversation,
    proprietaireEmail: toEmail,
  })
}
