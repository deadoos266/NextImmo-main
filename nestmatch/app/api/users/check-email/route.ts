/**
 * V55.1 — GET /api/users/check-email?email=foo@bar.com
 *
 * Server-side check si une adresse email est inscrite (existe dans
 * `users` OR `profils`). Utilisé par LocataireEmailField pour afficher
 * "déjà inscrit" / "à inviter" pendant la création d'une annonce.
 *
 * V50.14 — on check `profils` aussi car les users OAuth Google n'ont pas
 * de row dans `users` (seulement credentials), mais ont une row profils.
 *
 * Pourquoi server-side maintenant : V55.1 RLS Phase 5 final → REVOKE
 * SELECT anon sur `users` (la clé anon publique permettait jusqu'ici un
 * dump email-by-email). Cette route le proxy avec auth NextAuth.
 *
 * Sécurité :
 * - Auth NextAuth (anti-scraping anonyme).
 * - Rate-limit IP (anti-énumération masse).
 * - Retourne juste `{ exists: boolean }` (pas de payload sensible).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase()
  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 })
  }

  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`user-check:${userEmail}:${ip}`, { max: 60, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de requêtes" }, { status: 429 })
  }

  // V60.10 — Check profils en priorité (couvre OAuth + credentials).
  // Use ilike (case-insensitive) au cas où des rows legacy ont l'email en
  // mixed case (les nouveaux signups sont lowercase via lib/auth.ts l.85).
  // User a signalé bug récurrent malgré V50.14 → cause probable casing.
  const { count: profilCount } = await supabaseAdmin
    .from("profils")
    .select("email", { count: "exact", head: true })
    .ilike("email", email)
  if ((profilCount ?? 0) > 0) {
    return NextResponse.json({ ok: true, exists: true, source: "profils" })
  }
  // Fallback : check users table (legacy) — couvre les users credentials
  // dont le profil n'a pas encore été créé (cas edge mais possible).
  const { count: userCount } = await supabaseAdmin
    .from("users")
    .select("email", { count: "exact", head: true })
    .ilike("email", email)
  return NextResponse.json({ ok: true, exists: (userCount ?? 0) > 0, source: (userCount ?? 0) > 0 ? "users" : null })
}
