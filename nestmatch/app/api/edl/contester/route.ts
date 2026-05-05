/**
 * V69.1d — POST /api/edl/contester
 *
 * Workflow formel de contestation d'un EDL signé par le proprio. Le
 * locataire conteste un ou plusieurs items (état d'une pièce, équipement,
 * relevé compteur, etc.) avec motifs précis.
 *
 * Différent de /api/edl/save (commit 2ac9fa54) qui posait juste
 * `statut='conteste'` + commentaire libre. Ici : workflow structuré avec
 * items contestés détaillés et délai légal de réponse 30 jours.
 *
 * Body :
 *   {
 *     edl_id: string,
 *     items_contestes: [{ piece: string, item: string, motif: string }],
 *     message_global?: string
 *   }
 *
 * Effets :
 *   1. Update etats_des_lieux.statut = 'conteste' + items_contestes (jsonb)
 *      + contestation_date.
 *   2. Insert message [EDL_CONTESTE] avec payload structuré.
 *   3. Notif cloche proprio (V53.10) + email "EDL contesté — répondez sous 30j".
 *   4. Cron `edl-contestation-retard` (V69.2) ping si non résolu sous 30 jours.
 *
 * Sécurité : NextAuth + check locataire de l'annonce parente.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

interface ItemConteste {
  piece: string
  item: string
  motif: string
}

interface Body {
  edl_id?: string
  items_contestes?: ItemConteste[]
  message_global?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`edl-contester:${userEmail}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de contestations récentes — patientez 1h." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const edlId = typeof body.edl_id === "string" && body.edl_id ? body.edl_id : null
  if (!edlId) {
    return NextResponse.json({ ok: false, error: "edl_id requis" }, { status: 400 })
  }

  // Validation items_contestes
  const items = Array.isArray(body.items_contestes) ? body.items_contestes : []
  if (items.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "Précisez au moins 1 item contesté (pièce, item, motif).",
    }, { status: 400 })
  }
  if (items.length > 30) {
    return NextResponse.json({ ok: false, error: "Trop d'items (30 max)." }, { status: 400 })
  }
  const itemsCleaned: ItemConteste[] = []
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const piece = typeof it.piece === "string" ? it.piece.trim().slice(0, 100) : ""
    const item = typeof it.item === "string" ? it.item.trim().slice(0, 100) : ""
    const motif = typeof it.motif === "string" ? it.motif.trim().slice(0, 500) : ""
    if (!piece || !item || !motif) {
      return NextResponse.json({
        ok: false,
        error: "Chaque item contesté doit avoir piece + item + motif non vides.",
      }, { status: 400 })
    }
    itemsCleaned.push({ piece, item, motif })
  }

  const messageGlobal = typeof body.message_global === "string"
    ? body.message_global.trim().slice(0, 1000)
    : ""

  // Lookup EDL + check locataire
  const { data: edl } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("id, annonce_id, type, statut, proprietaire_email, locataire_email, email_locataire, signe_locataire_at, signe_bailleur_at")
    .eq("id", edlId)
    .maybeSingle()
  if (!edl) {
    return NextResponse.json({ ok: false, error: "EDL introuvable" }, { status: 404 })
  }

  const propEmail = (edl.proprietaire_email || "").toLowerCase()
  const locEmail = ((edl.locataire_email || edl.email_locataire) || "").toLowerCase()
  if (userEmail !== locEmail) {
    return NextResponse.json({
      ok: false,
      error: "Seul le locataire peut contester un EDL.",
    }, { status: 403 })
  }

  if (edl.statut === "conteste") {
    return NextResponse.json({
      ok: false,
      error: "Cet EDL est déjà contesté. Mettez à jour la contestation existante via /messages.",
    }, { status: 409 })
  }

  // L'EDL doit avoir été signé par le bailleur (sinon il peut encore le modifier)
  if (!edl.signe_bailleur_at) {
    return NextResponse.json({
      ok: false,
      error: "L'EDL doit être finalisé par le bailleur avant d'être contesté.",
    }, { status: 400 })
  }

  const now = new Date().toISOString()

  // 1. Update EDL
  const { error: updErr } = await supabaseAdmin
    .from("etats_des_lieux")
    .update({
      statut: "conteste",
      items_contestes: itemsCleaned,
      contestation_date: now,
      contestation_message: messageGlobal || null,
    })
    .eq("id", edlId)
  if (updErr) {
    console.error("[edl/contester] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Message [EDL_CONTESTE]
  const annonceId = edl.annonce_id
  if (propEmail && annonceId) {
    const payload = JSON.stringify({
      edlId,
      type: edl.type,
      annonceId,
      itemsContestes: itemsCleaned,
      messageGlobal: messageGlobal || null,
      contesteAt: now,
      delaiReponse: 30, // jours légaux
    })
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: propEmail,
      contenu: `[EDL_CONTESTE]${payload}`,
      lu: false,
      annonce_id: annonceId,
      created_at: now,
    }])

    // 3. Notif cloche proprio
    await supabaseAdmin.from("notifications").insert([{
      user_email: propEmail,
      type: "edl_conteste",
      title: `EDL ${edl.type === "entree" ? "d'entrée" : "de sortie"} contesté`,
      body: `${itemsCleaned.length} item${itemsCleaned.length > 1 ? "s" : ""} contesté${itemsCleaned.length > 1 ? "s" : ""}. Délai de réponse : 30 jours.`,
      href: `/edl/consulter/${edlId}`,
      related_id: String(annonceId),
      lu: false,
      created_at: now,
    }])
  }

  return NextResponse.json({
    ok: true,
    edlId,
    itemsCount: itemsCleaned.length,
    delaiReponseJours: 30,
    contesteAt: now,
  })
}
