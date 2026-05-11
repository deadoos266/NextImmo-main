/**
 * POST /api/bail/importer
 *
 * Permet à un proprio d'importer un bail existant signé hors plateforme :
 *  1. Valide les données saisies (titre du bien, ville, loyer, adresse,
 *     email locataire, etc.)
 *  2. Crée une `annonce` masquée (`bail_source = 'imported_pending'`,
 *     `statut = 'loué'`, `is_test = false`) — n'apparaît PAS dans /annonces
 *     publiques tant que le locataire n'a pas accepté (filtre public =
 *     `statut = 'disponible'`).
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
import { shouldSendEmailForEvent } from "../../../../lib/notifPreferencesServer"
import { checkRateLimitAsync, getClientIp } from "../../../../lib/rateLimit"

export const runtime = "nodejs"

// V95.A.1 — Annexes ALUR
type AnnexeState = {
  url: string | null
  included_in_bail: boolean
  not_required: boolean
}
type AnnexesAlur = {
  dpe?: AnnexeState
  erp?: AnnexeState
  crep?: AnnexeState
  notice_info?: AnnexeState
}

interface ImporterBody {
  titre: string
  ville: string
  adresse?: string
  codePostal?: string         // V95.A.2
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
  // V88.1 — URL Supabase Storage du PDF déjà uploadé côté client
  pdfFichierUrl?: string
  // V89.8 — Situation actuelle du locataire au moment de l'import
  dejaInstalle?: boolean
  dateEntreeReelle?: string  // YYYY-MM-DD
  loyersPassesPayes?: boolean
  edlEntreeDejaFait?: boolean
  // V95.A.1 — Annexes ALUR
  annexesAlur?: AnnexesAlur
  constructionAvant1949?: boolean
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
  const codePostal = sanitizeString(body.codePostal, 10)
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
  // V95.A.2 — Adresse + code postal requis pour mentions légales art. 21
  if (adresse.length < 4) {
    return NextResponse.json({ ok: false, error: "Adresse du logement requise (mentions légales quittances)" }, { status: 400 })
  }
  if (!/^\d{5}$/.test(codePostal)) {
    return NextResponse.json({ ok: false, error: "Code postal à 5 chiffres requis" }, { status: 400 })
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
  // V95.A.4 — Le PDF du bail est OBLIGATOIRE pour un import (preuve juridique)
  if (typeof body.pdfFichierUrl !== "string" || !body.pdfFichierUrl.trim()) {
    return NextResponse.json({ ok: false, error: "Le fichier PDF du bail est requis pour un import" }, { status: 400 })
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

  // V88.1 — Vérification basique du PDF (doit pointer sur notre bucket Storage)
  const pdfUrl = typeof body.pdfFichierUrl === "string" ? body.pdfFichierUrl.trim() : ""
  const pdfUrlSafe = pdfUrl && /^https?:\/\/[^\s]+$/.test(pdfUrl) && pdfUrl.length < 1000
    ? pdfUrl
    : null

  // V89.8 — Situation actuelle (locataire déjà installé)
  const dejaInstalle = body.dejaInstalle === true
  const dateEntreeReelleStr = typeof body.dateEntreeReelle === "string" ? body.dateEntreeReelle.trim() : ""
  const dateEntreeReelle = dejaInstalle && /^\d{4}-\d{2}-\d{2}$/.test(dateEntreeReelleStr) ? dateEntreeReelleStr : null
  const loyersPassesPayes = dejaInstalle && body.loyersPassesPayes === true
  const edlEntreeDejaFait = dejaInstalle && body.edlEntreeDejaFait === true

  // V95.A.1 — Sanitize annexes ALUR (chaque annexe = {url, included_in_bail, not_required})
  const ANNEXE_KEYS = ["dpe", "erp", "crep", "notice_info"] as const
  const annexesAlurSafe: AnnexesAlur = {}
  for (const k of ANNEXE_KEYS) {
    const a = body.annexesAlur?.[k]
    if (a && typeof a === "object") {
      annexesAlurSafe[k] = {
        url: typeof a.url === "string" && /^https?:\/\/[^\s]+$/.test(a.url) ? a.url.slice(0, 1000) : null,
        included_in_bail: a.included_in_bail === true,
        not_required: a.not_required === true,
      }
    }
  }
  const constructionAvant1949 = body.constructionAvant1949 === true

  // Crée l'annonce (masquée tant que pas acceptée)
  const importMetadata: Record<string, unknown> = {
    date_signature: body.dateSignature || null,
    date_debut: body.dateDebut || null,
    duree_mois: dureeMois,
    depot_garantie: depotGarantie,
    code_postal: codePostal,  // V95.A.2
    surface,
    pieces,
    meuble: !!body.meuble,
    imported_at: new Date().toISOString(),
    imported_by: proprioEmail,
    pdf_url: pdfUrlSafe,  // V88.1
    construction_avant_1949: constructionAvant1949,  // V95.A.1
    // V89.8 — Pour reconstituer l'historique à l'acceptance
    deja_installe: dejaInstalle,
    date_entree_reelle: dateEntreeReelle,
    loyers_passes_payes: loyersPassesPayes,
    edl_entree_deja_fait: edlEntreeDejaFait,
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
      // V95.A.1 — Annexes ALUR (loi 89-462 art. 3)
      annexes_alur: annexesAlurSafe,
      // V88.1 — bail_pdf_url (column ajoutée par migration 069) — pré-rempli
      // avec le PDF importé pour qu'il s'affiche dans le wizard /proprietaire/bail/[id].
      bail_pdf_url: pdfUrlSafe,
      // V88.fix — `loue` n'existe pas comme colonne ; on utilise `statut = 'loué'`
      // qui exclut l'annonce du listing public (`.eq("statut", "disponible")`).
      statut: "loué",
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
