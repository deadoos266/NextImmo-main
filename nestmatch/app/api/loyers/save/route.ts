/**
 * POST /api/loyers/save — V24.1 (Paul 2026-04-29)
 *
 * Centralise les writes sur la table `loyers` (insert/upsert/update) côté
 * serveur avec gating NextAuth. Remplace les writes client direct pour
 * permettre REVOKE INSERT/UPDATE anon (migration 034).
 *
 * Body modes :
 *   { mode: "declare", annonce_id, mois, montant }
 *     → locataire déclare un paiement (statut="déclaré")
 *   { mode: "confirm", id, statut?, date_confirmation? }
 *     → propriétaire confirme/refuse (statut "confirmé" | "refusé")
 *   { mode: "upsert", annonce_id, mois, montant, statut?, ... }
 *     → propriétaire upsert quittance (stats page)
 *
 * Auth :
 *   - "declare" : session.user.email = annonce.locataire_email
 *   - "confirm" : session.user.email = annonce.proprietaire_email
 *   - "upsert"  : session.user.email = annonce.proprietaire_email
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

const ALLOWED_UPSERT_FIELDS = new Set([
  "annonce_id", "mois", "montant", "statut", "date_confirmation",
  "date_paiement", "quittance_pdf_url", "proprietaire_email",
  "locataire_email", "remarque", "anomalie_montant",
])

const VALID_STATUTS = new Set(["déclaré", "confirmé", "refusé", "payé", "relancé"])

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
    return NextResponse.json({ error: "Body invalide" }, { status: 400 })
  }

  const mode = String(body.mode || "")

  if (mode === "declare") {
    // Locataire déclare un paiement
    const annonceId = Number(body.annonce_id)
    const mois = String(body.mois || "")
    const montant = Number(body.montant || 0)
    if (!Number.isFinite(annonceId) || annonceId <= 0) {
      return NextResponse.json({ error: "annonce_id invalide" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(mois)) {
      return NextResponse.json({ error: "mois invalide (YYYY-MM)" }, { status: 400 })
    }
    if (montant < 0 || montant > 50000) {
      return NextResponse.json({ error: "montant invalide" }, { status: 400 })
    }
    // Vérifier que session.user.email = annonce.locataire_email
    const { data: annonce } = await supabaseAdmin
      .from("annonces")
      .select("locataire_email, proprietaire_email")
      .eq("id", annonceId)
      .single()
    if (!annonce) return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 })
    if ((annonce.locataire_email || "").toLowerCase() !== email) {
      return NextResponse.json({ error: "Vous n'êtes pas le locataire" }, { status: 403 })
    }
    const { data, error } = await supabaseAdmin
      .from("loyers")
      .insert({
        annonce_id: annonceId,
        mois,
        montant,
        statut: "déclaré",
        locataire_email: email,
        proprietaire_email: annonce.proprietaire_email,
        ...(body.remarque ? { remarque: String(body.remarque).slice(0, 500) } : {}),
        ...(body.anomalie_montant !== undefined ? { anomalie_montant: !!body.anomalie_montant } : {}),
      })
      .select()
      .single()
    if (error) {
      console.error("[loyers/save declare]", error)
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, loyer: data })
  }

  if (mode === "confirm") {
    // Propriétaire confirme/refuse un paiement
    const id = Number(body.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "id invalide" }, { status: 400 })
    }
    const { data: existing } = await supabaseAdmin
      .from("loyers")
      .select("annonce_id, proprietaire_email")
      .eq("id", id)
      .single()
    if (!existing) return NextResponse.json({ error: "Loyer introuvable" }, { status: 404 })
    // Lookup propriétaire via annonce
    const { data: annonce } = await supabaseAdmin
      .from("annonces")
      .select("proprietaire_email")
      .eq("id", existing.annonce_id)
      .single()
    const propEmail = (annonce?.proprietaire_email || existing.proprietaire_email || "").toLowerCase()
    if (propEmail !== email) {
      return NextResponse.json({ error: "Vous n'êtes pas le propriétaire" }, { status: 403 })
    }
    const patch: Record<string, unknown> = {}
    if (body.statut !== undefined) {
      const s = String(body.statut)
      if (!VALID_STATUTS.has(s)) return NextResponse.json({ error: "Statut invalide" }, { status: 400 })
      patch.statut = s
    }
    if (body.date_confirmation !== undefined) patch.date_confirmation = String(body.date_confirmation)
    if (body.date_paiement !== undefined) patch.date_paiement = body.date_paiement ? String(body.date_paiement) : null
    if (body.remarque !== undefined) patch.remarque = body.remarque ? String(body.remarque).slice(0, 500) : null
    // V24.1 — quittance fields (proprio-only)
    if (body.quittance_envoyee_at !== undefined) patch.quittance_envoyee_at = body.quittance_envoyee_at ? String(body.quittance_envoyee_at) : null
    if (body.quittance_message_id !== undefined) patch.quittance_message_id = body.quittance_message_id
    if (body.quittance_pdf_url !== undefined) patch.quittance_pdf_url = body.quittance_pdf_url ? String(body.quittance_pdf_url) : null
    const { data, error } = await supabaseAdmin
      .from("loyers")
      .update(patch)
      .eq("id", id)
      .select()
      .single()
    if (error) {
      console.error("[loyers/save confirm]", error)
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, loyer: data })
  }

  if (mode === "upsert") {
    // Propriétaire upsert (stats page) — unique sur (annonce_id, mois) idéalement
    const annonceId = Number(body.annonce_id)
    if (!Number.isFinite(annonceId) || annonceId <= 0) {
      return NextResponse.json({ error: "annonce_id invalide" }, { status: 400 })
    }
    const { data: annonce } = await supabaseAdmin
      .from("annonces")
      .select("proprietaire_email, locataire_email")
      .eq("id", annonceId)
      .single()
    if (!annonce) return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 })
    if ((annonce.proprietaire_email || "").toLowerCase() !== email) {
      return NextResponse.json({ error: "Vous n'êtes pas le propriétaire" }, { status: 403 })
    }
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_UPSERT_FIELDS.has(k)) payload[k] = v
    }
    payload.proprietaire_email = email
    if (!payload.locataire_email) payload.locataire_email = annonce.locataire_email
    if (payload.statut && !VALID_STATUTS.has(String(payload.statut))) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 })
    }
    // Si id fourni → update, sinon insert
    const id = body.id ? Number(body.id) : null
    if (id && Number.isFinite(id) && id > 0) {
      const { data, error } = await supabaseAdmin
        .from("loyers")
        .update(payload)
        .eq("id", id)
        .select()
        .single()
      if (error) {
        console.error("[loyers/save upsert update]", error)
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
      }
      return NextResponse.json({ ok: true, loyer: data })
    }
    const { data, error } = await supabaseAdmin
      .from("loyers")
      .insert(payload)
      .select()
      .single()
    if (error) {
      console.error("[loyers/save upsert insert]", error)
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, loyer: data })
  }

  return NextResponse.json({ error: "Mode invalide (declare/confirm/upsert)" }, { status: 400 })
}
