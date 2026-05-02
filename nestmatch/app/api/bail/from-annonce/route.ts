/**
 * POST /api/bail/from-annonce — V23.2 (Paul 2026-04-29)
 *
 * Crée une bail_invitations pour une annonce DÉJÀ EXISTANTE (créée via le
 * wizard /proprietaire/ajouter step 7 statut="loué"). Différence avec
 * /api/bail/importer : pas de création d'annonce, juste l'invitation +
 * email locataire.
 *
 * Use case : proprio publie un bien déjà loué → wizard insert annonce
 * direct → cette route prend le relais pour créer l'invitation officielle
 * (sinon "loué" dans annonces sans aucune trace bail = bug audit V22.1).
 *
 * Sécurité :
 *  - NextAuth session requise.
 *  - Vérif : annonce.proprietaire_email === session email.
 *  - Rate-limit : 5/h/proprio + 20/h/IP.
 *  - Idempotence : retourne le token existant si invitation pending.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomBytes } from "node:crypto"
import { authOptions } from "../../../../lib/auth"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { sendEmail } from "../../../../lib/email/resend"
import { bailInvitationTemplate } from "../../../../lib/email/templates"
import { shouldSendEmailForEvent } from "../../../../lib/notifPreferencesServer"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"

export const runtime = "nodejs"

interface FromAnnonceBody {
  annonceId: number
  locataireEmail: string
  loyerHC?: number      // optionnel — fallback annonce.prix
  charges?: number      // optionnel — fallback annonce.charges
  messageProprio?: string
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function sanitizeString(s: unknown, max = 500): string {
  if (typeof s !== "string") return ""
  return s.trim().slice(0, max)
}

function formatDateFr(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  } catch {
    return iso
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const proprioEmail = session?.user?.email?.toLowerCase()
  if (!proprioEmail) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`bail-from-annonce:${proprioEmail}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de créations récentes, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } }
    )
  }
  const rlIp = await checkRateLimitAsync(`bail-from-annonce:ip:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 })
  if (!rlIp.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de requêtes." }, { status: 429 })
  }

  let body: FromAnnonceBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 })
  }

  const annonceId = Number(body.annonceId)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  const locataireEmail = sanitizeString(body.locataireEmail, 200).toLowerCase()
  if (!isValidEmail(locataireEmail)) {
    return NextResponse.json({ ok: false, error: "Email locataire invalide" }, { status: 400 })
  }
  if (locataireEmail === proprioEmail) {
    return NextResponse.json({ ok: false, error: "Vous ne pouvez pas vous inviter vous-même" }, { status: 400 })
  }
  const messageProprio = sanitizeString(body.messageProprio, 800)

  // Vérifier que l'annonce existe ET appartient au proprio
  const { data: annonce, error: annonceErr } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, prix, charges, proprietaire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (annonceErr || !annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  if ((annonce.proprietaire_email || "").toLowerCase() !== proprioEmail) {
    return NextResponse.json({ ok: false, error: "Cette annonce ne vous appartient pas" }, { status: 403 })
  }

  // Idempotence : invitation pending existante
  const { data: existing } = await supabaseAdmin
    .from("bail_invitations")
    .select("id, token, expires_at, statut")
    .eq("annonce_id", annonceId)
    .eq("proprietaire_email", proprioEmail)
    .eq("locataire_email", locataireEmail)
    .eq("statut", "pending")
    .maybeSingle()
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      invitationId: existing.id,
      invitationToken: existing.token,
      expiresAt: existing.expires_at,
      message: "Une invitation est déjà en attente — l'email peut être renvoyé.",
    })
  }

  // Loyer/charges : fallback sur annonce si pas fourni
  const loyerHC = Math.max(0, Math.min(50000, Number(body.loyerHC ?? annonce.prix ?? 0)))
  const charges = Math.max(0, Math.min(5000, Number(body.charges ?? annonce.charges ?? 0)))
  if (loyerHC < 1) {
    return NextResponse.json({ ok: false, error: "Loyer hors charges requis" }, { status: 400 })
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  const { error: invitErr } = await supabaseAdmin
    .from("bail_invitations")
    .insert({
      annonce_id: annonceId,
      proprietaire_email: proprioEmail,
      locataire_email: locataireEmail,
      token,
      statut: "pending",
      loyer_hc: loyerHC,
      charges,
      message_proprio: messageProprio || null,
      expires_at: expiresAt.toISOString(),
    })
  if (invitErr) {
    console.error("[bail/from-annonce] invitation insert failed", invitErr)
    return NextResponse.json({ ok: false, error: "Création invitation a échoué" }, { status: 500 })
  }

  // Email best-effort
  const { data: proprioProfil } = await supabaseAdmin
    .from("profils")
    .select("nom, prenom")
    .eq("email", proprioEmail)
    .maybeSingle()
  const proprioName = [proprioProfil?.prenom, proprioProfil?.nom].filter(Boolean).join(" ") || proprioEmail

  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  const acceptUrl = `${base}/bail-invitation/${token}`
  const declineUrl = `${base}/bail-invitation/${token}?action=refuser`

  const { subject, html, text } = bailInvitationTemplate({
    proprioName,
    bienTitre: annonce.titre || "Le bien",
    ville: annonce.ville || null,
    loyerHC,
    charges,
    acceptUrl,
    declineUrl,
    expiresAt: `le ${formatDateFr(expiresAt.toISOString())}`,
    messageProprio: messageProprio || null,
  })

  // V54.2 — respect notif_preferences (bail_envoye)
  const allowed = await shouldSendEmailForEvent(locataireEmail, "bail_envoye")
  const emailRes = allowed
    ? await sendEmail({
        to: locataireEmail,
        subject,
        html,
        text,
        tags: [{ name: "type", value: "bail_invitation_from_annonce" }],
        senderEmail: proprioEmail, // V50.1
      })
    : { ok: false as const, error: "Pref off", skipped: true }

  return NextResponse.json({
    ok: true,
    annonceId,
    invitationToken: token,
    expiresAt: expiresAt.toISOString(),
    emailSent: emailRes.ok === true,
  })
}
