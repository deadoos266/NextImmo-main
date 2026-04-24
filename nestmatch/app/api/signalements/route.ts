import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { RAISONS } from "@/lib/signalements"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

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

  // Rate-limit Upstash (IP + email) : 20 POST / h. Complète la limite DB
  // 10/jour/user en empêchant un attaquant de brûler les tokens via plusieurs
  // comptes depuis la même IP.
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`signalements:${ip}:${email}`, { max: 20, windowMs: 3600_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
    )
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

  // On ne signale pas son propre contenu
  if (parsed.data.type === "annonce") {
    const { data: annonce } = await supabaseAdmin
      .from("annonces")
      .select("proprietaire_email")
      .eq("id", Number(parsed.data.target_id))
      .single()
    if (annonce && (annonce.proprietaire_email || "").toLowerCase() === email) {
      return NextResponse.json({ success: false, error: "Vous ne pouvez pas signaler votre propre annonce." }, { status: 403 })
    }
  }
  if (parsed.data.type === "user" && parsed.data.target_id.toLowerCase() === email) {
    return NextResponse.json({ success: false, error: "Vous ne pouvez pas vous signaler vous-même." }, { status: 403 })
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
    console.error("[/api/signalements POST]", error, { email, type: parsed.data.type, target_id: parsed.data.target_id })
    // En prod : message générique (pas de leak de schéma DB).
    // En dev : on expose le détail pour faciliter le debug.
    const isProd = process.env.NODE_ENV === "production"
    const msg = isProd
      ? "Erreur serveur. L'équipe a été notifiée."
      : `Erreur DB (code ${error.code || "?"}) : ${error.message || "inconnue"}`
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
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
