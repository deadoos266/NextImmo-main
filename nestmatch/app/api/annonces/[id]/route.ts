/**
 * DELETE /api/annonces/[id]
 *
 * Supprime une annonce + nettoyage cascade (visites, messages, carnet,
 * loyers, EDL, clics, signalements liés).
 *
 * Autorisé pour : admin OU proprietaire_email === session.email.
 * Utilise service_role pour bypass RLS et garantir la suppression.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  // Rate-limit suppression annonce : 10/h par user+IP. Une suppression massive
  // peut orphan'er messages/visites/signalements donc on limite agressivement.
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`annonces:delete:${ip}:${email}`, { max: 10, windowMs: 3600_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de suppressions récentes. Réessayez plus tard." },
      { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
    )
  }

  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "ID invalide" }, { status: 400 })
  }

  // Charge l'annonce + le flag admin en parallèle
  const [annonceRes, userRes] = await Promise.all([
    supabaseAdmin.from("annonces").select("id, proprietaire_email").eq("id", id).single(),
    supabaseAdmin.from("users").select("is_admin").eq("email", email).single(),
  ])

  if (annonceRes.error || !annonceRes.data) {
    return NextResponse.json({ success: false, error: "Annonce introuvable" }, { status: 404 })
  }

  const isAdmin = userRes.data?.is_admin === true
  const isOwner = (annonceRes.data.proprietaire_email || "").toLowerCase() === email

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const idStr = String(id)
  const cleanups = await Promise.allSettled([
    supabaseAdmin.from("visites").delete().eq("annonce_id", id),
    supabaseAdmin.from("messages").delete().eq("annonce_id", id),
    supabaseAdmin.from("carnet_entretien").delete().eq("annonce_id", id),
    supabaseAdmin.from("loyers").delete().eq("annonce_id", id),
    supabaseAdmin.from("etats_des_lieux").delete().eq("annonce_id", id),
    supabaseAdmin.from("clics_annonces").delete().eq("annonce_id", id),
    supabaseAdmin.from("signalements").delete().eq("type", "annonce").eq("target_id", idStr),
  ])

  const failures = cleanups
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any)?.error))
  if (failures.length > 0) {
    console.warn(`[annonces DELETE] cleanup warnings for annonce ${id}:`, failures.map(f => f.i))
  }

  const { error: delErr } = await supabaseAdmin.from("annonces").delete().eq("id", id)
  if (delErr) {
    console.error(`[annonces DELETE] échec suppression annonce ${id}:`, delErr)
    return NextResponse.json(
      { success: false, error: `Suppression échouée : ${delErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
