/**
 * V63 — POST /api/visites/proposer
 *
 * Encapsule l'orchestration "Proposer une visite" depuis BookingVisite :
 *   1. Insert visite (statut=proposée).
 *   2. Insert message [demande visite] dans la conversation associée.
 *   3. Notif cloche proprio.
 *
 * Préreq migration 058 : la step 2 (insert messages) doit passer server-side
 * pour que le client n'ait plus besoin du grant SELECT/INSERT anon.
 *
 * Sécurité :
 *   - NextAuth requis. locataire_email = session strictement.
 *   - Vérifie que la candidature est validée (gating métier — le locataire
 *     ne peut proposer une visite qu'une fois validé par le proprio).
 *   - Rate-limit : 5 visites/h/user.
 *   - Pas de visite sur sa propre annonce.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface Body {
  annonceId?: number | string
  date?: string         // YYYY-MM-DD
  heure?: string        // HH:MM
  format?: "physique" | "visio"
  message?: string
}

const HEURE_RE = /^\d{2}:\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // Rate-limit 5/h/user
  const rl = await checkRateLimitAsync(`visite-proposer:${me}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de demandes — patientez 1h." },
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
  const date = typeof body.date === "string" ? body.date.trim() : ""
  const heure = typeof body.heure === "string" ? body.heure.trim() : ""
  const format: "physique" | "visio" = body.format === "visio" ? "visio" : "physique"
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : ""

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ ok: false, error: "Date invalide (YYYY-MM-DD)" }, { status: 400 })
  }
  if (!HEURE_RE.test(heure)) {
    return NextResponse.json({ ok: false, error: "Heure invalide (HH:MM)" }, { status: 400 })
  }
  // Date future uniquement (anti-erreur de saisie)
  const dateMs = new Date(date + "T12:00:00").getTime()
  if (!Number.isFinite(dateMs) || dateMs < Date.now() - 24 * 3600 * 1000) {
    return NextResponse.json({ ok: false, error: "La date ne peut pas être dans le passé" }, { status: 400 })
  }

  // Lookup annonce + proprio
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, proprietaire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const proprio = (annonce.proprietaire_email || "").toLowerCase()
  if (!proprio) {
    return NextResponse.json({ ok: false, error: "Pas de propriétaire associé" }, { status: 400 })
  }
  if (proprio === me) {
    return NextResponse.json({ ok: false, error: "Vous ne pouvez pas proposer une visite sur votre propre annonce" }, { status: 400 })
  }

  // 1. Insert visite
  const { data: visite, error: visErr } = await supabaseAdmin
    .from("visites")
    .insert({
      annonce_id: annonceId,
      locataire_email: me,
      proprietaire_email: proprio,
      date_visite: date,
      heure,
      format,
      message: message || null,
      statut: "proposée",
      propose_par: me,
    })
    .select("id")
    .single()
  if (visErr || !visite) {
    console.error("[visites/proposer] insert visite failed", visErr)
    return NextResponse.json({ ok: false, error: "Création visite échouée" }, { status: 500 })
  }

  // 2. Message dans la conv (pour /messages)
  const dateFormat = new Date(date + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  })
  const formatLabel = format === "visio" ? "visio" : "sur place"
  const contenu = `Demande de visite (${formatLabel}) : ${dateFormat} à ${heure}${message ? ` — « ${message} »` : ""}`
  const now = new Date().toISOString()
  await supabaseAdmin.from("messages").insert([{
    from_email: me,
    to_email: proprio,
    contenu,
    lu: false,
    annonce_id: annonceId,
    created_at: now,
  }])

  // 3. Notif cloche proprio
  await supabaseAdmin.from("notifications").insert([{
    user_email: proprio,
    type: "visite_proposee",
    title: "Nouvelle demande de visite",
    body: `${dateFormat} à ${heure}`,
    href: "/visites",
    related_id: String(visite.id),
    lu: false,
    created_at: now,
  }])

  return NextResponse.json({ ok: true, visiteId: visite.id })
}
