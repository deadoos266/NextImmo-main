/**
 * POST /api/notifications/candidats-orphelins
 *
 * Appelée fire-and-forget par `messages/page.tsx accepterLocation` quand un
 * proprio accepte officiellement un candidat (statut annonce → "loué",
 * locataire_email renseigné). Envoie un email respectueux à TOUS les autres
 * candidats ayant contacté cette annonce pour leur dire que leur dossier
 * n'a pas été retenu et qu'ils peuvent continuer leur recherche.
 *
 * Garde-fous :
 *   - Auth NextAuth (session = proprio, vérif que c'est bien son annonce).
 *   - Respect des préférences `profils.notif_candidatures_email` (même si
 *     c'est un usage dérivé, c'est le plus proche conceptuellement).
 *   - Rate-limit 1 déclenchement par annonce dans l'heure (on ne doit pas
 *     spammer si le proprio accepte/refuse plusieurs fois).
 *
 * Body :  { annonceId: number, locataireRetenu: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { sendEmail } from "@/lib/email/resend"
import { candidatOrphelinTemplate } from "@/lib/email/templates"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const callerEmail = session?.user?.email?.toLowerCase()
  if (!callerEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const p = body as { annonceId?: unknown; locataireRetenu?: unknown }
  const annonceId = typeof p.annonceId === "number" ? p.annonceId
    : typeof p.annonceId === "string" ? Number(p.annonceId) : NaN
  const retenu = typeof p.locataireRetenu === "string" ? p.locataireRetenu.trim().toLowerCase() : ""
  if (!Number.isFinite(annonceId) || !retenu) {
    return NextResponse.json({ ok: false, error: "annonceId + locataireRetenu requis" }, { status: 400 })
  }

  // Rate-limit : 1 déclenchement / annonce / heure.
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`orphelins:${annonceId}`, { max: 1, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: true, skipped: "rate_limited" })
  }
  // Secondary : anti-abus caller+IP (max 20/h par proprio)
  const rlCaller = await checkRateLimitAsync(`orphelins:caller:${callerEmail}:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 })
  if (!rlCaller.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de déclenchements" }, { status: 429 })
  }

  // Vérif ownership : l'annonce existe ET le caller est bien le proprio.
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  if (String(annonce.proprietaire_email || "").toLowerCase() !== callerEmail) {
    return NextResponse.json({ ok: false, error: "Pas proprio de cette annonce" }, { status: 403 })
  }

  // Cherche TOUS les candidats (from_email distincts) qui ont posté un
  // message type "candidature" sur cette annonce, en excluant celui retenu
  // ET le proprio lui-même (messages système).
  const { data: candidatures } = await supabaseAdmin
    .from("messages")
    .select("from_email")
    .eq("annonce_id", annonceId)
    .eq("type", "candidature")
  const uniqueEmails = Array.from(
    new Set(
      (candidatures || [])
        .map((c: { from_email: string }) => String(c.from_email || "").trim().toLowerCase())
        .filter((e: string) => e && e !== retenu && e !== callerEmail),
    ),
  )

  if (uniqueEmails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  // Récupère les prefs email de tous les candidats en un seul query.
  const { data: profs } = await supabaseAdmin
    .from("profils")
    .select("email, notif_candidatures_email")
    .in("email", uniqueEmails)
  const optedIn = new Set(
    (profs || [])
      .filter((p: { notif_candidatures_email?: boolean | null }) => p.notif_candidatures_email !== false)
      .map((p: { email: string }) => p.email.toLowerCase()),
  )
  // Les users sans row profils (nouveau signup sans prefs) → default true.
  for (const email of uniqueEmails) {
    if (!profs || !profs.find((p: { email: string }) => p.email.toLowerCase() === email)) {
      optedIn.add(email)
    }
  }

  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
  const annoncesUrl = `${base}/annonces`
  const { subject, html, text } = candidatOrphelinTemplate({
    bienTitre: annonce.titre || "votre location",
    ville: annonce.ville ?? null,
    annoncesUrl,
  })

  let sent = 0
  let failed = 0
  // Envoi séquentiel simple — si 30+ candidats, Resend gère facilement, pas
  // besoin de parallélisme ici. Les échecs ne bloquent pas les suivants.
  for (const email of uniqueEmails) {
    if (!optedIn.has(email)) continue
    const res = await sendEmail({
      to: email,
      subject,
      html,
      text,
      tags: [
        { name: "category", value: "candidat-orphelin" },
        { name: "annonce", value: String(annonceId) },
      ],
    })
    if (res.ok) sent++
    else failed++
  }

  return NextResponse.json({ ok: true, sent, failed, total: uniqueEmails.length })
}
