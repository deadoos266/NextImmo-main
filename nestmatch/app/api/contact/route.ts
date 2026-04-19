import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { SUJETS_CONTACT } from "@/lib/contacts"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

const schema = z.object({
  nom: z.string().min(2).max(120),
  email: z.string().email().max(180),
  sujet: z.string().min(1),
  message: z.string().min(10).max(4000),
  // Honeypot : champ invisible rempli par les bots uniquement → si non vide, on rejette silencieusement.
  website: z.string().optional(),
})

/**
 * POST /api/contact — formulaire public de contact.
 * Pas d'auth requise. Rate-limit IP + email (5/h).
 */
export async function POST(req: NextRequest) {
  // Rate-limit IP (10/h) — anti-spam indépendant de l'email (qu'un spammeur peut changer)
  const ip = getClientIp(req.headers)
  const rlIp = await checkRateLimitAsync(`contact:ip:${ip}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rlIp.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de messages récents. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSec ?? 3600) } }
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
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Données invalides" },
      { status: 422 },
    )
  }

  // Honeypot trigger : on renvoie un faux succès pour ne pas alerter le bot.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return NextResponse.json({ success: true })
  }

  const validSujets = SUJETS_CONTACT.map(s => s.code)
  if (!validSujets.includes(parsed.data.sujet)) {
    return NextResponse.json({ success: false, error: "Sujet invalide" }, { status: 422 })
  }

  // Rate-limit par email : max 5 messages/h
  const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("email", parsed.data.email.toLowerCase())
    .gte("created_at", sinceHour)

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { success: false, error: "Trop de messages récents. Réessayez dans une heure." },
      { status: 429 },
    )
  }

  const { error } = await supabaseAdmin.from("contacts").insert({
    nom: parsed.data.nom.trim(),
    email: parsed.data.email.toLowerCase().trim(),
    sujet: parsed.data.sujet,
    message: parsed.data.message.trim(),
    statut: "ouvert",
  })

  if (error) {
    console.error("[/api/contact POST]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * GET /api/contact — liste admin uniquement.
 * Query : ?statut=ouvert|en_cours|resolu|all
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const statut = req.nextUrl.searchParams.get("statut") || "ouvert"
  let query = supabaseAdmin
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  if (statut !== "all") query = query.eq("statut", statut)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true, contacts: data || [] })
}
