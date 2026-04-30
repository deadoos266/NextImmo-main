/**
 * POST /api/bail/importer
 *
 * Permet à un proprio d'importer un bail existant signé hors plateforme :
 *  1. Valide les données saisies (titre du bien, ville, loyer, adresse,
 *     email locataire, etc.)
 *  2. Crée une `annonce` masquée (`bail_source = 'imported_pending'`,
 *     `loue = true`, `is_test = false`) — n'apparaît PAS dans /annonces
 *     publiques tant que le locataire n'a pas accepté.
 *  3. Crée une `bail_invitations` avec un token aléatoire valide 14 jours.
 *  4. Envoie l'email Resend au locataire avec lien accept / decline.
 *
 * Sécurité : auth NextAuth requise. Pas de upload PDF dans le MVP — V2.
 *
 * Idempotence : si une invitation `pending` existe déjà pour la même paire
 * (proprio, locataire, annonce), on renvoie le token existant sans recréer.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomBytes } from "node:crypto"
import { authOptions } from "../../../../lib/auth"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { sendEmail } from "../../../../lib/email/resend"
import { bailInvitationTemplate } from "../../../../lib/email/templates"
import { shouldSendEmailForEvent } from "../../../../lib/notifPreferences"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"

export const runtime = "nodejs"

interface ImporterBody {
  titre: string
  ville: string
  adresse?: string
  loyerHC: number
  charges?: number
  surface?: number
  pieces?: number
  meuble?: boolean
  locataireEmail: string
  dateSignature?: string  // YYYY-MM-DD
  dateDebut?: string      // YYYY-MM-DD
  dureeMois?: number
  depotGarantie?: number
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

  // Anti-spam : 5 imports / heure / proprio
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`bail-import:${proprioEmail}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop d'imports récents, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } }
    )
  }
  const rlIp = await checkRateLimitAsync(`bail-import:ip:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 })
  if (!rlIp.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de requêtes." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSec ?? 3600) } }
    )
  }

  let body: ImporterBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 })
  }

  const titre = sanitizeString(body.titre, 200)
  const ville = sanitizeString(body.ville, 100)
  const adresse = sanitizeString(body.adresse, 300)
  const locataireEmail = sanitizeString(body.locataireEmail, 200).toLowerCase()
  const messageProprio = sanitizeString(body.messageProprio, 800)
  const loyerHC = Math.max(0, Math.min(50000, Number(body.loyerHC) || 0))
  const charges = Math.max(0, Math.min(5000, Number(body.charges) || 0))
  const surface = Math.max(0, Math.min(2000, Number(body.surface) || 0))
  const pieces = Math.max(0, Math.min(20, Number(body.pieces) || 0))
  const depotGarantie = Math.max(0, Math.min(50000, Number(body.depotGarantie) || 0))
  const dureeMois = Math.max(1, Math.min(120, Number(body.dureeMois) || 36))

  if (titre.length < 3) {
    return NextResponse.json({ ok: false, error: "Titre du bien trop court" }, { status: 400 })
  }
  if (ville.length < 2) {
    return NextResponse.json({ ok: false, error: "Ville requise" }, { status: 400 })
  }
  if (loyerHC < 1) {
    return NextResponse.json({ ok: false, error: "Loyer hors charges requis" }, { status: 400 })
  }
  if (!isValidEmail(locataireEmail)) {
    return NextResponse.json({ ok: false, error: "Email locataire invalide" }, { status: 400 })
  }
  if (locataireEmail === proprioEmail) {
    return NextResponse.json({ ok: false, error: "Vous ne pouvez pas vous inviter vous-même" }, { status: 400 })
  }

  // Vérifie si une invitation pending existe déjà pour cette paire
  // (proprio, locataire) + ville/titre — évite les doublons accidentels.
  const { data: existingInvit } = await supabaseAdmin
    .from("bail_invitations")
    .select("id, token, annonce_id, expires_at, statut")
    .eq("proprietaire_email", proprioEmail)
    .eq("locataire_email", locataireEmail)
    .eq("statut", "pending")
    .maybeSingle()

  if (existingInvit && new Date(existingInvit.expires_at).getTime() > Date.now()) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      invitationId: existingInvit.id,
      annonceId: existingInvit.annonce_id,
      message: "Une invitation est déjà en attente pour ce locataire — l'email peut être renvoyé depuis la liste.",
    })
  }

  // Crée l'annonce (masquée tant que pas acceptée)
  const importMetadata: Record<string, unknown> = {
    date_signature: body.dateSignature || null,
    date_debut: body.dateDebut || null,
    duree_mois: dureeMois,
    depot_garantie: depotGarantie,
    surface,
    pieces,
    meuble: !!body.meuble,
    imported_at: new Date().toISOString(),
    imported_by: proprioEmail,
  }

  const { data: annonce, error: annonceErr } = await supabaseAdmin
    .from("annonces")
    .insert({
      titre,
      ville,
      adresse: adresse || null,
      prix: loyerHC,
      charges: charges || null,
      surface: surface || null,
      pieces: pieces || null,
      meuble: !!body.meuble,
      proprietaire_email: proprioEmail,
      bail_source: "imported_pending",
      import_metadata: importMetadata,
      loue: true,
      is_test: false,
      created_at: new Date().toISOString(),
    })
    .select("id, titre, ville")
    .single()

  if (annonceErr || !annonce) {
    console.error("[bail/importer] annonce insert failed", annonceErr)
    return NextResponse.json({ ok: false, error: "Création annonce a échoué" }, { status: 500 })
  }

  // Crée le token (32 bytes hex = 64 chars, plus que suffisant)
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)  // 14 jours

  const { error: invitErr } = await supabaseAdmin
    .from("bail_invitations")
    .insert({
      annonce_id: annonce.id,
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
    console.error("[bail/importer] invitation insert failed", invitErr)
    // Cleanup : supprime l'annonce orpheline
    await supabaseAdmin.from("annonces").delete().eq("id", annonce.id)
    return NextResponse.json({ ok: false, error: "Création invitation a échoué" }, { status: 500 })
  }

  // Envoi email locataire (best-effort)
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
    bienTitre: titre,
    ville: ville || null,
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
        tags: [{ name: "type", value: "bail_invitation" }],
        senderEmail: proprioEmail, // V50.1
      })
    : { ok: false as const, error: "Pref off", skipped: true }

  return NextResponse.json({
    ok: true,
    annonceId: annonce.id,
    invitationToken: token,
    expiresAt: expiresAt.toISOString(),
    emailSent: emailRes.ok === true,
  })
}
