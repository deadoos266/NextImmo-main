/**
 * V97.35 P3-3 — GET /api/reviews/[email]
 *
 * Renvoie la liste des reviews publiques d'un user (= reçues, en tant que
 * target), avec moyenne et compte par rôle. Utilisé sur la page profil
 * publique d'un user et dans les cards locataire/proprio sur les
 * annonces / candidatures.
 *
 * Auth : public (les reviews publiées sont visibles sans auth).
 *
 * Réponse :
 *   {
 *     ok: true,
 *     target_email: "x@x.fr",
 *     total: 5,
 *     average_global: 4.4,
 *     reviews: [{ id, role, score_global, score_details, comment, author_email_masked, published_at }, ...]
 *   }
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Masquage email auteur pour anti-doxxing (j.dupont@gmail.com → j.d***@gmail.com)
function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "anonyme"
  const [local, domain] = email.split("@")
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local.slice(0, 2)}***@${domain}`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const { email } = await params
  const target_email = decodeURIComponent(email).toLowerCase().trim()
  if (!target_email || !target_email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .select("id, role, score_global, score_details, comment, author_email, published_at")
    .eq("target_email", target_email)
    .not("published_at", "is", null)
    .eq("hidden_by_admin", false)
    .order("published_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[api/reviews GET]", error)
    return NextResponse.json({ ok: false, error: "Erreur lecture" }, { status: 500 })
  }

  const reviews = (data || []).map(r => ({
    id: r.id,
    role: r.role,
    score_global: r.score_global,
    score_details: r.score_details || {},
    comment: r.comment,
    author_email_masked: maskEmail(r.author_email),
    published_at: r.published_at,
  }))

  const total = reviews.length
  const average_global = total > 0
    ? Math.round((reviews.reduce((s, r) => s + r.score_global, 0) / total) * 10) / 10
    : null

  const by_role = {
    locataire: reviews.filter(r => r.role === "locataire").length,
    proprietaire: reviews.filter(r => r.role === "proprietaire").length,
  }

  return NextResponse.json({
    ok: true,
    target_email,
    total,
    average_global,
    by_role,
    reviews,
  })
}
