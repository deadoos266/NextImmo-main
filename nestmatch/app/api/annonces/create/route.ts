/**
 * V69.1f — POST /api/annonces/create
 *
 * Création server-side d'une annonce. Avant V69 : INSERT direct via supabase
 * client (anon key) depuis app/proprietaire/ajouter/page.tsx — ce qui
 * cassera dès qu'on REVOKE INSERT anon sur `annonces` (migration 060).
 *
 * Sécurité :
 *   - NextAuth requis. proprietaire_email = session strictement.
 *   - is_test forcé à `false` côté server (anti-tricherie : un client
 *     malveillant ne peut plus poster is_test=true pour masquer ses
 *     annonces des recherches publiques).
 *   - Rate-limit 10 annonces/h/user (anti-abus).
 *   - Validation Zod minimale sur les champs critiques (titre, ville,
 *     prix). Le reste passe via whitelist + fallback en cas de colonne
 *     manquante (migration 025 / R10.6 pas toujours appliquée).
 *
 * Préserve les 3 fallbacks legacy (lat/lng, criteresV2, criteresCandidats)
 * pour compatibilité avec DB où les migrations optionnelles n'ont pas tourné.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"

// Validation Zod minimale (les autres champs whitelist via toAnnoncePayload)
const createSchema = z.object({
  titre: z.string().trim().min(3, "Titre trop court (3 caractères min)").max(200),
  ville: z.string().trim().min(1, "Ville requise").max(100),
  adresse: z.string().trim().max(300).optional(),
  prix: z.number().int().positive().max(50000, "Loyer max 50000€"),
  charges: z.number().int().min(0).max(5000).optional(),
  caution: z.number().int().min(0).max(50000).optional(),
  surface: z.number().int().min(0).max(1000).optional(),
  pieces: z.number().int().min(0).max(50).optional(),
  chambres: z.number().int().min(0).max(50).optional(),
  description: z.string().max(5000).optional(),
}).passthrough() // accepte les autres champs sans valider — ils passent par la whitelist

// Whitelist de toutes les colonnes acceptées en INSERT.
// Les colonnes optionnelles (post-migration 025/R10.6) sont retirées
// progressivement via les fallbacks en cas d'erreur "column does not exist".
const WHITELIST_COLS = new Set([
  "titre", "ville", "adresse", "prix", "charges", "caution",
  "surface", "pieces", "chambres", "etage", "dpe", "dispo", "statut",
  "description", "type_bien", "photos", "lat", "lng",
  // Champs prosais
  "membre", "verifie",
  // Critères candidats v1
  "min_revenus_ratio", "garants_acceptes", "profils_acceptes", "message_proprietaire",
  // Critères candidats v2 (R10.6)
  "age_min", "age_max", "max_occupants", "animaux_politique", "fumeur_politique",
  "equipements_extras",
  // Toggles équipements
  "meuble", "fibre", "parking", "cave", "balcon", "terrasse", "jardin",
  "ascenseur", "animaux",
  // Bail importé / déjà loué
  "locataire_email", "date_debut_bail", "mensualite_credit", "valeur_bien",
  "duree_credit", "taxe_fonciere", "assurance_pno", "charges_copro_annuelles",
])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const proprioEmail = session?.user?.email?.toLowerCase()
  if (!proprioEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // Rate-limit 10/h/user + 30/h/IP
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`annonce-create:${proprioEmail}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop d'annonces créées récemment — patientez 1h." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }
  const rlIp = await checkRateLimitAsync(`annonce-create:ip:${ip}`, { max: 30, windowMs: 60 * 60 * 1000 })
  if (!rlIp.allowed) {
    return NextResponse.json({ ok: false, error: "Trop de requêtes." }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const firstErr = parsed.error.errors[0]?.message ?? "Données invalides"
    return NextResponse.json({ ok: false, error: firstErr }, { status: 422 })
  }
  const input = parsed.data as Record<string, unknown>

  // Build payload — whitelist seul + force proprio + force is_test=false
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (WHITELIST_COLS.has(k) && v !== null && v !== "") {
      payload[k] = v
    }
  }
  // Forçage server-side : impossible de tricher
  payload.proprietaire = session?.user?.name ?? null
  payload.proprietaire_email = proprioEmail
  payload.is_test = false // V68 fix #7 — un proprio ne peut plus poster is_test=true
  payload.membre = "Membre depuis " + new Date().getFullYear()
  payload.verifie = true

  // INSERT avec fallback progressif (3 niveaux selon colonnes manquantes)
  // C'est la même logique qu'avant côté client, conservée pour compat
  // avec DB legacy.
  const tryInsert = async (data: Record<string, unknown>) => {
    return supabaseAdmin.from("annonces").insert([data]).select("id").single()
  }

  let result = await tryInsert(payload)
  let error = result.error

  // Fallback 1 : retire lat/lng si migration coords pas appliquée
  if (error && /lat|lng|column.*does not exist/i.test(error.message || "")) {
    const p1 = { ...payload }
    delete p1.lat
    delete p1.lng
    result = await tryInsert(p1)
    error = result.error
  }

  // Fallback 2 : retire critères v2 (R10.6 / migration 025)
  if (error && /age_min|age_max|max_occupants|animaux_politique|fumeur_politique|equipements_extras|column.*does not exist/i.test(error.message || "")) {
    const p2 = { ...payload }
    for (const k of ["age_min", "age_max", "max_occupants", "animaux_politique", "fumeur_politique", "equipements_extras", "lat", "lng"]) {
      delete p2[k]
    }
    result = await tryInsert(p2)
    error = result.error
  }

  // Fallback 3 : retire critères v1 (migration 025 candidats)
  if (error && /min_revenus_ratio|garants_acceptes|profils_acceptes|message_proprietaire|column.*does not exist/i.test(error.message || "")) {
    const p3 = { ...payload }
    for (const k of ["min_revenus_ratio", "garants_acceptes", "profils_acceptes", "message_proprietaire", "age_min", "age_max", "max_occupants", "animaux_politique", "fumeur_politique", "equipements_extras", "lat", "lng"]) {
      delete p3[k]
    }
    result = await tryInsert(p3)
    error = result.error
  }

  if (error || !result.data) {
    console.error("[annonces/create] insert failed", error)
    return NextResponse.json({
      ok: false,
      error: `Création annonce échouée : ${error?.message ?? "erreur inconnue"}`,
    }, { status: 500 })
  }

  const annonceId = result.data.id

  // Marque le proprio comme actif (pour useRole côté client) — best-effort
  try {
    await supabaseAdmin
      .from("profils")
      .upsert({ email: proprioEmail, is_proprietaire: true }, { onConflict: "email" })
  } catch (e) {
    console.warn("[annonces/create] profil is_proprietaire upsert failed", e)
  }

  return NextResponse.json({ ok: true, annonceId })
}
