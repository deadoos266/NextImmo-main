import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { RAISONS } from "@/lib/signalements"

const schema = z.object({
  type: z.enum(["annonce", "message", "user"]),
  target_id: z.string().min(1).max(200),
  raison: z.string().min(1),
  description: z.string().max(1000).optional().nullable(),
})

/**
 * POST /api/signalements — crée un nouveau signalement
 * Auth requise. Rate-limit simple (10/user/jour) pour éviter le spam.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Données invalides" }, { status: 422 })
  }

  // Validation raison
  const validRaisons = RAISONS.map(r => r.code)
  if (!validRaisons.includes(parsed.data.raison)) {
    return NextResponse.json({ success: false, error: "Raison invalide" }, { status: 422 })
  }

  // Rate limit 10/jour/user
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from("signalements")
    .select("id", { count: "exact", head: true })
    .eq("signale_par", email)
    .gte("created_at", since)

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ success: false, error: "Trop de signalements récents. Réessayez demain." }, { status: 429 })
  }

  // Anti-doublon : un même user ne peut signaler 2x la même cible dans les 7 jours
  const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabaseAdmin
    .from("signalements")
    .select("id")
    .eq("signale_par", email)
    .eq("type", parsed.data.type)
    .eq("target_id", parsed.data.target_id)
    .gte("created_at", sinceWeek)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ success: false, error: "Vous avez déjà signalé cet élément récemment." }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from("signalements").insert({
    type: parsed.data.type,
    target_id: parsed.data.target_id,
    raison: parsed.data.raison,
    description: parsed.data.description ?? null,
    signale_par: email,
    statut: "ouvert",
  })

  if (error) {
    console.error("[/api/signalements POST]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * GET /api/signalements — liste (admin uniquement)
 * Query : ?statut=ouvert (default) | traite | rejete | all
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const statut = req.nextUrl.searchParams.get("statut") || "ouvert"
  let query = supabaseAdmin
    .from("signalements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  if (statut !== "all") query = query.eq("statut", statut)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true, signalements: data || [] })
}
