/**
 * POST /api/notifications/create — Crée une notif pour un autre user.
 *
 * Motif : quand l'user A envoie un message/propose une visite à l'user B, il
 * doit pouvoir poser une notif pour B. Ce endpoint wrappe `createNotification`
 * avec auth + rate-limit — le client ne peut pas insérer directement dans
 * `notifications` via supabase anon (on laisse la table lisible via service
 * role server-side uniquement).
 *
 * Body JSON :
 *   { userEmail, type, title, body?, href?, relatedId? }
 *
 * Auth : la session NextAuth du caller est requise. Le caller peut notifier
 * n'importe qui (ex: notifier le destinataire d'un message). Rate-limit 120/h
 * par caller+IP pour éviter l'abus.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { createNotification, isNotifType } from "@/lib/notifications"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const callerEmail = session?.user?.email?.toLowerCase()
  if (!callerEmail) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`notif-create:${callerEmail}:${ip}`, {
    max: 120,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de notifications récentes" }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 })
  }

  const p = body as {
    userEmail?: unknown; type?: unknown; title?: unknown;
    body?: unknown; href?: unknown; relatedId?: unknown;
  }

  const userEmail = typeof p.userEmail === "string" ? p.userEmail.trim().toLowerCase() : ""
  const title = typeof p.title === "string" ? p.title.trim() : ""
  if (!userEmail || !title) {
    return NextResponse.json({ error: "userEmail et title requis" }, { status: 400 })
  }
  if (!isNotifType(p.type)) {
    return NextResponse.json({ error: "type invalide" }, { status: 400 })
  }

  const bodyText = typeof p.body === "string" ? p.body.slice(0, 500) : null
  const href = typeof p.href === "string" && p.href.startsWith("/") ? p.href.slice(0, 200) : null
  const relatedId = typeof p.relatedId === "string" ? p.relatedId.slice(0, 64) : null

  await createNotification({
    userEmail,
    type: p.type,
    title: title.slice(0, 120),
    body: bodyText,
    href,
    relatedId,
  })

  return NextResponse.json({ ok: true })
}
