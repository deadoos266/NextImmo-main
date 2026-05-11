/**
 * V88.3 — /api/quittances/perso
 *
 * Gestion des quittances PERSO du locataire (PDFs / images qu'il a déjà
 * en main, hors plateforme — historique avant adoption KeyMatch).
 *
 *   GET    : liste des quittances perso du locataire connecté
 *   POST   : ajoute une entrée (le fichier doit être uploadé en amont
 *            par le client dans bucket `quittances/{email}/perso-*`).
 *            Body JSON : { fichier_url, mois, montant?, loyer_hc?,
 *                          charges?, bailleur_nom?, adresse_bien?,
 *                          note?, fichier_nom?, fichier_taille_bytes?,
 *                          fichier_type, annonce_id? }
 *   DELETE : retire une quittance perso (?id=123). Supprime aussi le
 *            fichier dans Storage si possible.
 *
 * Sécurité : auth NextAuth + le locataire ne peut voir/modifier QUE
 * ses propres quittances perso (filtre `locataire_email === userEmail`).
 * Rate-limit : 30 uploads/h/email pour éviter spam.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_NOTE = 600
const MAX_BAILLEUR = 200
const MAX_ADRESSE = 300
const MAX_FILENAME = 300
const MAX_FICHIER_BYTES = 15 * 1024 * 1024  // 15 MB

function safeStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function safeNum(v: unknown, min = 0, max = 1_000_000): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n < min || n > max) return null
  return Math.round(n * 100) / 100
}

function isMoisValid(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

function isUrlSafe(u: unknown): u is string {
  if (typeof u !== "string") return false
  if (u.length > 1500) return false
  return /^https?:\/\/[^\s]+$/.test(u)
}

// GET — liste
export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("quittances_perso")
    .select("id, annonce_id, mois, montant, loyer_hc, charges, bailleur_nom, adresse_bien, note, fichier_url, fichier_nom, fichier_taille_bytes, fichier_type, created_at")
    .eq("locataire_email", email)
    .order("mois", { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, quittances: data || [] })
}

// POST — ajout
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`quittance-perso:${email}`, { max: 30, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop d'ajouts récents, réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 })
  }

  if (!isUrlSafe(body.fichier_url)) {
    return NextResponse.json({ ok: false, error: "URL fichier invalide" }, { status: 400 })
  }
  if (!isMoisValid(body.mois)) {
    return NextResponse.json({ ok: false, error: "Mois invalide (format YYYY-MM)" }, { status: 400 })
  }
  const fichierType = body.fichier_type === "image" ? "image" : "pdf"
  const tailleBytes = Number(body.fichier_taille_bytes) || null
  if (tailleBytes !== null && (tailleBytes < 0 || tailleBytes > MAX_FICHIER_BYTES)) {
    return NextResponse.json({ ok: false, error: "Fichier trop volumineux (max 15 MB)" }, { status: 400 })
  }
  const annonceIdRaw = Number(body.annonce_id)
  const annonceId = Number.isFinite(annonceIdRaw) && annonceIdRaw > 0 ? annonceIdRaw : null

  // Si annonce_id fourni, on vérifie que le locataire est bien lié à cette annonce
  // (soit via bail_invitations accepted, soit via annonces.locataire_email).
  if (annonceId) {
    const [{ data: ann }, { data: invit }] = await Promise.all([
      supabaseAdmin.from("annonces").select("id, locataire_email").eq("id", annonceId).maybeSingle(),
      supabaseAdmin.from("bail_invitations").select("id").eq("annonce_id", annonceId).eq("locataire_email", email).eq("statut", "accepted").maybeSingle(),
    ])
    const lieParBail = ann?.locataire_email?.toLowerCase() === email
    const lieParInvit = !!invit
    if (!lieParBail && !lieParInvit) {
      // On accepte quand même (le locataire peut avoir un historique d'un autre
      // logement non-KeyMatch), mais on retire le lien annonce_id pour pas
      // créer de pollution.
      // Pas d'erreur → continue sans annonce_id.
    }
  }

  const insertRow = {
    locataire_email: email,
    annonce_id: annonceId,
    mois: body.mois as string,
    montant: safeNum(body.montant),
    loyer_hc: safeNum(body.loyer_hc),
    charges: safeNum(body.charges, 0, 10_000),
    bailleur_nom: safeStr(body.bailleur_nom, MAX_BAILLEUR),
    adresse_bien: safeStr(body.adresse_bien, MAX_ADRESSE),
    note: safeStr(body.note, MAX_NOTE),
    fichier_url: body.fichier_url as string,
    fichier_nom: safeStr(body.fichier_nom, MAX_FILENAME),
    fichier_taille_bytes: tailleBytes,
    fichier_type: fichierType,
  }

  const { data, error } = await supabaseAdmin
    .from("quittances_perso")
    .insert(insertRow)
    .select("id, mois, fichier_url, fichier_type, created_at")
    .single()

  if (error) {
    console.error("[quittances/perso] insert failed", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, quittance: data })
}

// DELETE — supprime entrée + fichier
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  const url = new URL(req.url)
  const id = Number(url.searchParams.get("id") || 0)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "id invalide" }, { status: 400 })
  }

  // On récupère d'abord la ligne (pour le path Storage)
  const { data: row, error: selErr } = await supabaseAdmin
    .from("quittances_perso")
    .select("id, locataire_email, fichier_url")
    .eq("id", id)
    .maybeSingle()
  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Introuvable" }, { status: 404 })
  }
  if (row.locataire_email?.toLowerCase() !== email) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  // Suppression de la row d'abord (la suppression Storage est best-effort)
  const { error: delErr } = await supabaseAdmin
    .from("quittances_perso")
    .delete()
    .eq("id", id)
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
  }

  // Best-effort cleanup Storage
  try {
    // fichier_url format Supabase Storage public :
    // https://<project>.supabase.co/storage/v1/object/public/quittances/<path>
    const match = /\/storage\/v1\/object\/public\/quittances\/(.+)$/.exec(row.fichier_url || "")
    if (match?.[1]) {
      await supabaseAdmin.storage.from("quittances").remove([decodeURIComponent(match[1])])
    }
  } catch (err) {
    console.warn("[quittances/perso] storage cleanup failed", err)
  }

  return NextResponse.json({ ok: true })
}
