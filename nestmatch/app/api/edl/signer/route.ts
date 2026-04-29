/**
 * POST /api/edl/signer — Signature électronique d'un état des lieux.
 *
 * Même pattern que /api/bail/signer :
 *   - Auth NextAuth
 *   - Rate-limit 10 sign/heure/user
 *   - Validation email, mention manuscrite, PNG signature
 *   - Upsert dans edl_signatures + timestamp sur etats_des_lieux
 *
 * Après signature locataire → statut = "valide".
 * Après signature bailleur → pas de changement statut (facultatif).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const signataireEmail = session?.user?.email?.toLowerCase()
  if (!signataireEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`edl-sign:${signataireEmail}`, {
    max: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de tentatives, réessayez plus tard" },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const p = body as {
    edlId?: unknown
    role?: unknown
    nom?: unknown
    mention?: unknown
    signaturePng?: unknown
  }

  const edlId = typeof p.edlId === "string" ? p.edlId : ""
  const role = typeof p.role === "string" ? p.role : ""
  const nom = typeof p.nom === "string" ? p.nom.trim() : ""
  const mention = typeof p.mention === "string" ? p.mention.trim() : ""
  const signaturePng = typeof p.signaturePng === "string" ? p.signaturePng : ""

  if (!edlId) {
    return NextResponse.json({ ok: false, error: "edlId invalide" }, { status: 400 })
  }
  if (!["locataire", "bailleur"].includes(role)) {
    return NextResponse.json({ ok: false, error: "role invalide" }, { status: 400 })
  }
  if (nom.length < 2) {
    return NextResponse.json({ ok: false, error: "Nom trop court" }, { status: 400 })
  }
  // V50.11 — STRICT equality après normalisation (avant : /lu et approuv/i
  // acceptait n'importe quelle phrase contenant "lu et approuv" → laissait
  // passer "Lu et approuvé Lu et approuvé" en doublon).
  const mentionNorm = mention
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
  if (mentionNorm !== "lu et approuve, bon pour accord") {
    return NextResponse.json(
      { ok: false, error: 'La mention doit être recopiée exactement : "Lu et approuvé, bon pour accord" — c\'est une exigence légale.' },
      { status: 400 },
    )
  }
  if (!signaturePng.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ ok: false, error: "Signature PNG invalide" }, { status: 400 })
  }
  if (signaturePng.length > 500_000) {
    return NextResponse.json({ ok: false, error: "Signature trop lourde" }, { status: 413 })
  }

  // Vérifier que le signataire est le bon interlocuteur de l'EDL
  const { data: edl, error: errEdl } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("id, annonce_id, proprietaire_email, locataire_email, type")
    .eq("id", edlId)
    .single()
  if (errEdl || !edl) {
    return NextResponse.json({ ok: false, error: "EDL introuvable" }, { status: 404 })
  }

  const expectedEmail =
    role === "locataire"
      ? (edl.locataire_email || "").toLowerCase()
      : (edl.proprietaire_email || "").toLowerCase()
  if (expectedEmail !== signataireEmail) {
    return NextResponse.json(
      { ok: false, error: "Vous n'êtes pas autorisé à signer cet EDL en tant que " + role },
      { status: 403 },
    )
  }

  // Upsert signature
  const userAgent = req.headers.get("user-agent") || ""
  const now = new Date().toISOString()
  const { error: errIns } = await supabaseAdmin.from("edl_signatures").upsert(
    {
      edl_id: edlId,
      signataire_email: signataireEmail,
      signataire_nom: nom,
      signataire_role: role,
      signature_png: signaturePng,
      mention,
      ip_address: ip,
      user_agent: userAgent,
      signe_at: now,
    },
    { onConflict: "edl_id,signataire_email,signataire_role" },
  )
  if (errIns) {
    console.error("[edl/signer] insert error:", errIns)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  // Update timestamps sur etats_des_lieux + bascule statut à "valide" si locataire signe
  const patch: Record<string, string> = {}
  if (role === "locataire") {
    patch.signe_locataire_at = now
    patch.statut = "valide"
    patch.date_validation = now
  }
  if (role === "bailleur") patch.signe_bailleur_at = now
  if (Object.keys(patch).length > 0) {
    const { error: errUpd } = await supabaseAdmin
      .from("etats_des_lieux")
      .update(patch)
      .eq("id", edlId)
    if (errUpd) console.error("[edl/signer] update EDL:", errUpd)
  }

  // Notifier l'autre partie
  const autre =
    role === "locataire"
      ? (edl.proprietaire_email || "").toLowerCase()
      : (edl.locataire_email || "").toLowerCase()
  if (autre && autre !== signataireEmail) {
    const typeLabel = edl.type === "entree" ? "d'entrée" : "de sortie"
    const actionLabel = role === "locataire" ? "signé et validé" : "contresigné"
    const { error: errMsg } = await supabaseAdmin.from("messages").insert([
      {
        from_email: signataireEmail,
        to_email: autre,
        contenu: `✓ État des lieux ${typeLabel} ${actionLabel} par ${nom}`,
        lu: false,
        annonce_id: edl.annonce_id || null,
        created_at: now,
      },
    ])
    if (errMsg) console.error("[edl/signer] message notif:", errMsg)

    const { error: errNotif } = await supabaseAdmin.from("notifications").insert([
      {
        user_email: autre,
        type: "edl_envoye",
        title: role === "locataire" ? "EDL signé et validé" : "EDL contresigné",
        body: `${nom} a ${actionLabel} l'état des lieux ${typeLabel}.`,
        href: `/edl/consulter/${edlId}`,
        related_id: String(edl.annonce_id || edlId),
        lu: false,
        created_at: now,
      },
    ])
    if (errNotif) console.error("[edl/signer] notif cloche:", errNotif)
  }

  return NextResponse.json({ ok: true, signedAt: now })
}
