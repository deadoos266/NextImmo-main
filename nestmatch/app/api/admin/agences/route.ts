/**
 * V97.39.34 — GET /api/admin/agences
 *
 * Liste les agences avec filtre par statut. Admin only.
 *
 * Query :
 *   ?statut=pending|active|refused|banned  (défaut: all)
 *   ?limit=50
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { createSignedUrl } from "@/lib/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const url = new URL(req.url)
  const statut = url.searchParams.get("statut")
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200)

  let query = supabaseAdmin
    .from("agences")
    .select("id, slug, name, raison_sociale, siret, carte_t_numero, carte_t_doc_path, email, telephone, adresse, code_postal, ville, statut, validated_at, validated_by, refused_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (statut && ["pending", "active", "refused", "banned"].includes(statut)) {
    query = query.eq("statut", statut)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Génère signed URL pour les docs carte T (1h TTL)
  const enriched = await Promise.all((data || []).map(async (a) => {
    let carteTSignedUrl: string | null = null
    if (a.carte_t_doc_path) {
      const s = await createSignedUrl("agences-docs", a.carte_t_doc_path, 3600)
      if (s.ok) carteTSignedUrl = s.data.url
    }
    return { ...a, carte_t_signed_url: carteTSignedUrl }
  }))

  return NextResponse.json({ ok: true, agences: enriched, count: enriched.length })
}
