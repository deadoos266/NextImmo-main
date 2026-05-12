/**
 * V97.30 P3-5.B.3 — GET /api/admin/top-annonces
 *
 * Top 10 annonces dans les 30 derniers jours, sur 2 axes :
 *  - Par vues uniques (DISTINCT email dans clics_annonces)
 *  - Par candidatures reçues (messages type='candidature')
 *
 * Pour chaque annonce : id, titre, ville, prix, count, lien public.
 *
 * Auth : admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DAYS_WINDOW = 30
const TOP_N = 10
const DAY_MS = 24 * 60 * 60 * 1000

interface AnnonceInfo {
  id: number
  titre: string | null
  ville: string | null
  prix: number | null
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const since = new Date(Date.now() - DAYS_WINDOW * DAY_MS).toISOString()

  // 1. Top vues : agrégation par annonce_id sur clics_annonces (uniques par email)
  const { data: clics } = await supabaseAdmin
    .from("clics_annonces")
    .select("annonce_id, email")
    .gte("created_at", since)
    .limit(50000)

  // Map annonce_id → Set<email> pour comptage uniques
  const viewsByAnnonce = new Map<number, Set<string>>()
  for (const c of clics || []) {
    if (!c.annonce_id) continue
    const e = (c.email || "anonymous").toLowerCase()
    if (!viewsByAnnonce.has(c.annonce_id)) viewsByAnnonce.set(c.annonce_id, new Set())
    viewsByAnnonce.get(c.annonce_id)!.add(e)
  }

  // 2. Top candidatures : count par annonce_id sur messages type='candidature'
  const { data: candidatures } = await supabaseAdmin
    .from("messages")
    .select("annonce_id")
    .eq("type", "candidature")
    .gte("created_at", since)
    .limit(50000)

  const candByAnnonce = new Map<number, number>()
  for (const m of candidatures || []) {
    if (!m.annonce_id) continue
    candByAnnonce.set(m.annonce_id, (candByAnnonce.get(m.annonce_id) || 0) + 1)
  }

  // 3. Récupère le détail des annonces top
  const topViewsIds = Array.from(viewsByAnnonce.entries())
    .map(([id, set]) => ({ id, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)

  const topCandIds = Array.from(candByAnnonce.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)

  const allIds = Array.from(new Set([...topViewsIds.map(t => t.id), ...topCandIds.map(t => t.id)]))
  const annoncesById = new Map<number, AnnonceInfo>()
  if (allIds.length > 0) {
    const { data: anns } = await supabaseAdmin
      .from("annonces")
      .select("id, titre, ville, prix")
      .in("id", allIds)
    for (const a of anns || []) {
      annoncesById.set(a.id, a)
    }
  }

  function enrich(rows: Array<{ id: number; count: number }>) {
    return rows.map(r => {
      const a = annoncesById.get(r.id)
      return {
        annonce_id: r.id,
        count: r.count,
        titre: a?.titre || `Annonce #${r.id}`,
        ville: a?.ville || null,
        prix: a?.prix || null,
        href: `/annonces/${r.id}`,
      }
    })
  }

  return NextResponse.json({
    ok: true,
    window_days: DAYS_WINDOW,
    top_views: enrich(topViewsIds),
    top_candidatures: enrich(topCandIds),
  })
}
