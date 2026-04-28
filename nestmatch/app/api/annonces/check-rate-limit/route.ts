/**
 * POST /api/annonces/check-rate-limit
 *
 * Pre-check appele par le wizard /proprietaire/ajouter avant d'inserer une
 * annonce. Limite : 5 inserts / 10 min / user (email auth NextAuth) + 20
 * inserts / heure / IP (anti-spam massive).
 *
 * Le rate-limit est best-effort cote client : un user contournant la route
 * (insert direct supabase) passe quand meme. Pour un guard inflexible, il
 * faudrait migrer l'insert lui-meme cote serveur (V2). En attendant, cette
 * route protege contre les double-clicks accidentels et le spam normal.
 *
 * Auth : NextAuth (email requis, sinon 401).
 * Reponse : { ok: true } ou 429 + { error, retryAfterSec }.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../lib/auth"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  const ip = getClientIp(req.headers)
  const rlEmail = await checkRateLimitAsync(`annonce-create:${email}`, {
    max: 5,
    windowMs: 10 * 60 * 1000,
  })
  if (!rlEmail.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de publications récentes. Réessayez dans quelques minutes.", retryAfterSec: rlEmail.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rlEmail.retryAfterSec ?? 600) } }
    )
  }
  const rlIp = await checkRateLimitAsync(`annonce-create:ip:${ip}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  })
  if (!rlIp.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de requêtes depuis cette adresse." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSec ?? 3600) } }
    )
  }

  return NextResponse.json({ ok: true })
}
