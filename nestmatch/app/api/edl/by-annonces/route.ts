/**
 * V65.2 — POST /api/edl/by-annonces { ids: number[] }
 *
 * Batch fetch des EDL pour plusieurs annonces (utilisé par /proprietaire
 * dashboard pour afficher les statuts EDL en cards).
 *
 * Retourne un payload léger (annonce_id, type, statut, date_edl, created_at)
 * pour minimiser le transfert réseau.
 *
 * Sécurité :
 *   - NextAuth requis.
 *   - Scope : appelant doit être proprio de toutes les annonces demandées.
 *     Si une seule n'appartient pas au caller → 403 sur la liste entière.
 *
 * V97.7 — Migration GET→POST : avec 200+ annonces (admin/proprio gros parc),
 * la query string `?ids=1,2,3...` dépassait 2KB → HTTP 400 côté Vercel.
 * Body JSON résout ça + augmente la limite à 500. Pas de cache CDN sur cette
 * route (force-dynamic) donc rien perdu en passant en POST.
 *
 * Préreq migration 059 (REVOKE SELECT anon sur etats_des_lieux).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_IDS = 500

async function fetchEdls(ids: number[], me: string) {
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, edls: [] })
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ ok: false, error: `Trop d'ids (max ${MAX_IDS})` }, { status: 400 })
  }

  // Scope : toutes les annonces doivent appartenir au caller
  const { data: anns } = await supabaseAdmin
    .from("annonces")
    .select("id, proprietaire_email")
    .in("id", ids)
  const owners = new Set((anns || []).map(a => (a.proprietaire_email || "").toLowerCase()))
  if (owners.size === 0 || (owners.size === 1 && !owners.has(me)) || owners.size > 1) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("annonce_id, type, statut, date_edl, created_at")
    .in("annonce_id", ids)
  if (error) {
    console.error("[edl/by-annonces]", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, edls: data ?? [] })
}

function parseIds(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw
      .map(v => Number(v))
      .filter(n => Number.isFinite(n) && n > 0)
  }
  if (typeof raw === "string") {
    return raw.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0)
  }
  return []
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 })
  }
  const ids = parseIds((body as { ids?: unknown })?.ids)
  return fetchEdls(ids, me)
}

/**
 * V97.7 — GET conservé pour rétro-compat (anciens clients), mais plafonné à
 * 100 ids pour éviter HTTP 400 sur URL trop longue. Nouveau code = POST.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const ids = parseIds(req.nextUrl.searchParams.get("ids"))
  if (ids.length > 100) {
    return NextResponse.json({ ok: false, error: "Trop d'ids pour GET (max 100). Utilisez POST." }, { status: 400 })
  }
  return fetchEdls(ids, me)
}
